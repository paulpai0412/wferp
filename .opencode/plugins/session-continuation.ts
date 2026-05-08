import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"

import { type Plugin, tool } from "@opencode-ai/plugin"

const NEW_SESSION_REQUEST_RELATIVE_PATH = ".opencode/runtime/new-session-request.json"
const NEW_SESSION_RESULT_RELATIVE_PATH = ".opencode/runtime/new-session-result.json"

type NewSessionRequest = {
  reason?: string
  title?: string
  agent?: string
  prompt?: string
}

type NewSessionResult = {
  status: "success" | "error"
  parentSessionID: string
  childSessionID?: string
  title: string
  reason?: string
  error?: string
  recordedAt: string
}

const SAFE_PRIMARY_AGENTS = new Set(["build", "plan"])

async function consumeNewSessionRequest(worktree: string): Promise<NewSessionRequest | undefined> {
  const requestPath = join(worktree, NEW_SESSION_REQUEST_RELATIVE_PATH)
  try {
    const requestText = await readFile(requestPath, "utf-8")
    await rm(requestPath, { force: true })
    return JSON.parse(requestText)
  } catch {
    return undefined
  }
}

async function writeNewSessionResult(worktree: string, result: NewSessionResult): Promise<void> {
  const resultPath = join(worktree, NEW_SESSION_RESULT_RELATIVE_PATH)
  await mkdir(join(worktree, ".opencode/runtime"), { recursive: true })
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8")
}

function buildNewSessionPrompt(request: NewSessionRequest): string {
  return (
    request.prompt ??
    [
      "Resume the autonomous Workflow ERP development workflow from checkpoint only.",
      "Read docs/agents/runtime/context-checkpoint.yaml first.",
      "Do not import or rely on the prior session transcript.",
      "Use compact_payload.authoritative_refs and compact_payload.immediate_next_action as the source of truth.",
      "Continue with the next workflow action, preserving repo role boundaries and checkpoint-only resume policy.",
    ].join("\n")
  )
}

function resolveBootstrapAgent(request: NewSessionRequest): string {
  if (!request.agent) return "build"
  const normalizedAgent = request.agent.trim().toLowerCase()
  return SAFE_PRIMARY_AGENTS.has(normalizedAgent) ? normalizedAgent : "build"
}

async function continueInNewSession(
  client: Parameters<Plugin>[0]["client"],
  directory: string,
  parentSessionID: string,
  request: NewSessionRequest,
): Promise<{ childSessionID: string; title: string }> {
  const title = request.title ?? "Continue workflow from checkpoint"
  const created = await client.session.create({
    query: { directory },
    body: {
      parentID: parentSessionID,
      title,
    },
  })
  if (created.error) {
    throw new Error(`OpenCode session.create failed: ${String(created.error)}`)
  }

  const childSessionID = created.data?.id
  if (!childSessionID) {
    throw new Error("OpenCode session.create did not return a child session id")
  }

  const promptResult = await client.session.promptAsync({
    path: { id: childSessionID },
    query: { directory },
    body: {
      agent: resolveBootstrapAgent(request),
      parts: [
        {
          type: "text",
          text: buildNewSessionPrompt(request),
        },
      ],
    },
  })
  if (promptResult.error) {
    throw new Error(`OpenCode session.promptAsync failed: ${String(promptResult.error)}`)
  }

  return { childSessionID, title }
}

export const SessionContinuationPlugin: Plugin = async ({ client, directory, worktree }) => {
  return {
    event: async ({ event }) => {
      if (event.type !== "session.idle") return

      const newSessionRequest = await consumeNewSessionRequest(worktree)
      if (!newSessionRequest) return

      try {
        const result = await continueInNewSession(client, directory, event.properties.sessionID, newSessionRequest)
        await writeNewSessionResult(worktree, {
          status: "success",
          parentSessionID: event.properties.sessionID,
          childSessionID: result.childSessionID,
          title: result.title,
          reason: newSessionRequest.reason,
          recordedAt: new Date().toISOString(),
        })
      } catch (error) {
        await writeNewSessionResult(worktree, {
          status: "error",
          parentSessionID: event.properties.sessionID,
          title: newSessionRequest.title ?? "Continue workflow from checkpoint",
          reason: newSessionRequest.reason,
          error: error instanceof Error ? error.message : String(error),
          recordedAt: new Date().toISOString(),
        })
      }
    },
    tool: {
      continue_in_new_session: tool({
        description:
          "Create a fresh OpenCode child session and prompt it to resume this repo workflow from docs/agents/runtime/context-checkpoint.yaml.",
        args: {
          reason: tool.schema.string().optional().describe("Why a fresh continuation session is being created."),
          title: tool.schema.string().optional().describe("Optional title for the child session."),
          agent: tool.schema.string().optional().describe("Optional OpenCode agent name for the bootstrap prompt."),
          prompt: tool.schema.string().optional().describe("Optional custom bootstrap prompt."),
        },
        async execute(args, context) {
          context.metadata({
            title: "Continue in new session",
            metadata: {
              sessionID: context.sessionID,
              reason: args.reason ?? "not specified",
            },
          })

          const result = await continueInNewSession(client, context.directory, context.sessionID, args)

          return {
            output: `Created continuation session ${result.childSessionID} from ${context.sessionID}.`,
            metadata: {
              parentSessionID: context.sessionID,
              childSessionID: result.childSessionID,
              title: result.title,
            },
          }
        },
      }),
    },
  }
}
