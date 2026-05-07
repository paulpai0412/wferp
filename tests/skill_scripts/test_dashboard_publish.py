from skill_scripts.dashboard_canvas import DashboardCanvas, create_dashboard_chart_draft, load_dashboard_canvas
from skill_scripts.dashboard_publish import (
    DashboardDraft,
    approve_dashboard_draft,
    mark_dashboard_data_meaning_changed,
    preview_dashboard_draft,
    publish_dashboard,
    reject_dashboard_draft,
)
from skill_scripts.design_template_catalog import select_design_template
from skill_scripts.governed_query import GovernedQueryResult, QueryEvidence, approve_query_result


def _query_result(sql: str = "SELECT [month],[revenue] FROM [dbo].[SALES]") -> GovernedQueryResult:
    return GovernedQueryResult(
        evidence=QueryEvidence(
            prompt="查詢2026年月營收",
            sql=sql,
            route="rule",
            route_reason="test",
            validation_status="OK",
            execution_status="OK",
            execution_timestamp="2026-05-07T00:00:00+00:00",
            returned_columns=["month", "revenue"],
            row_count=2,
            sample_rows=[
                {"month": "2026-01", "revenue": 1000.0},
                {"month": "2026-02", "revenue": 1500.0},
            ],
        )
    )


def _canvas(sql: str = "SELECT [month],[revenue] FROM [dbo].[SALES]") -> DashboardCanvas:
    canvas = DashboardCanvas(columns=12, rows=8)
    chart = create_dashboard_chart_draft(
        approve_query_result(_query_result(sql=sql)),
        {"chart_type": "bar", "title": "Monthly Revenue", "x_field": "month", "y_field": "revenue"},
    )
    _ = canvas.add_chart("revenue", chart, x=0, y=0, w=6, h=4)
    return canvas


def _draft(dashboard_id: str = "dashboard-1", sql: str = "SELECT [month],[revenue] FROM [dbo].[SALES]") -> DashboardDraft:
    return DashboardDraft(
        dashboard_id=dashboard_id,
        canvas_payload=_canvas(sql=sql).to_payload(),
        template_selection=select_design_template("soft_operations"),
    )


def test_dashboard_draft_preview_includes_canvas_chart_specs_and_template() -> None:
    persisted_canvas = _canvas().to_payload()
    reloaded_canvas = load_dashboard_canvas(persisted_canvas)
    draft = DashboardDraft(
        dashboard_id="dashboard-1",
        canvas_payload=reloaded_canvas.to_payload(),
        template_selection=select_design_template("soft_operations"),
    )

    preview = preview_dashboard_draft(draft)

    assert preview == {
        "dashboard_id": "dashboard-1",
        "state": "draft",
        "template": {
            "template_id": "soft_operations",
            "name": "Soft Operations",
            "tokens": {"background": "#f8fafc", "surface": "#ffffff", "accent": "#2563eb", "text": "#0f172a"},
        },
        "canvas": persisted_canvas,
    }
    assert preview["canvas"]["items"][0]["chart"] == {"chart_type": "bar", "title": "Monthly Revenue", "x_field": "month", "y_field": "revenue"}


def test_dashboard_draft_requires_final_analyst_approval_before_publish() -> None:
    draft = _draft()

    try:
        _ = publish_dashboard(draft)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "DASHBOARD_FINAL_APPROVAL_REQUIRED" in str(exc)

    approved = approve_dashboard_draft(draft, approver="analyst-1")
    published = publish_dashboard(approved)

    assert published.dashboard_id == "dashboard-1"
    assert published.version == 1
    assert published.payload["state"] == "published"
    assert published.audit_events[-1]["event"] == "dashboard_published"


def test_published_dashboard_version_is_immutable_after_draft_changes() -> None:
    approved = approve_dashboard_draft(_draft(), approver="analyst-1")
    published = publish_dashboard(approved)
    original_payload = published.payload
    changed_draft = DashboardDraft(
        dashboard_id="dashboard-1",
        canvas_payload=_canvas().to_payload(),
        template_selection=select_design_template("ledger_focus"),
    )

    changed_preview = preview_dashboard_draft(changed_draft)

    assert changed_preview["template"] != original_payload["template"]
    assert published.payload == original_payload
    assert published.payload["version"] == 1


def test_data_meaning_changes_require_reapproval_before_republish() -> None:
    approved = approve_dashboard_draft(_draft(), approver="analyst-1")
    published = publish_dashboard(approved)
    changed = mark_dashboard_data_meaning_changed(approved, reason="sql_changed")

    try:
        _ = publish_dashboard(changed, previous=published)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "DASHBOARD_REAPPROVAL_REQUIRED" in str(exc)

    reapproved = approve_dashboard_draft(changed, approver="analyst-2")
    republished = publish_dashboard(reapproved, previous=published)

    assert republished.version == 2
    assert [event["event"] for event in republished.audit_events][-3:] == [
        "dashboard_reapproval_required",
        "dashboard_final_approved",
        "dashboard_published",
    ]


def test_rejected_and_invalid_dashboard_publish_transitions_are_refused() -> None:
    rejected = reject_dashboard_draft(_draft(), approver="analyst-1", reason="wrong metric")

    try:
        _ = approve_dashboard_draft(rejected, approver="analyst-2")
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "DASHBOARD_DRAFT_NOT_APPROVABLE:rejected" in str(exc)

    try:
        _ = publish_dashboard(rejected)
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "DASHBOARD_FINAL_APPROVAL_REQUIRED" in str(exc)

    try:
        _ = reject_dashboard_draft(_draft(), approver="analyst-1", reason="")
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "DASHBOARD_REJECTION_REASON_REQUIRED" in str(exc)


def test_approval_rejection_publish_and_reapproval_events_are_audited() -> None:
    rejected = reject_dashboard_draft(_draft(), approver="analyst-1", reason="wrong metric")
    approved = approve_dashboard_draft(_draft(), approver="analyst-1")
    published = publish_dashboard(approved)
    changed = mark_dashboard_data_meaning_changed(approved, reason="dashboard_data_source_changed")

    assert rejected.audit_events[-1] == {
        "event": "dashboard_final_rejected",
        "dashboard_id": "dashboard-1",
        "state": "rejected",
        "approver": "analyst-1",
        "reason": "wrong metric",
    }
    assert approved.audit_events[-1]["event"] == "dashboard_final_approved"
    assert published.audit_events[-1] == {
        "event": "dashboard_published",
        "dashboard_id": "dashboard-1",
        "version": 1,
        "state": "published",
    }
    assert changed.audit_events[-1] == {
        "event": "dashboard_reapproval_required",
        "dashboard_id": "dashboard-1",
        "state": "reapproval_required",
        "reason": "dashboard_data_source_changed",
    }
