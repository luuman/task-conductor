from app.pipeline.engine import PipelineEngine, STAGE_ORDER, StageTransitionError

def test_stage_order():
    assert STAGE_ORDER[0] == "input"
    assert "done" in STAGE_ORDER
    assert len(STAGE_ORDER) == 10

def test_can_advance_stage():
    engine = PipelineEngine()
    assert engine.next_stage("input") == "analysis"
    assert engine.next_stage("analysis") == "prd"
    assert engine.next_stage("prd") == "ui"

def test_advance_from_done_raises():
    engine = PipelineEngine()
    try:
        engine.next_stage("done")
        assert False, "Should raise StageTransitionError"
    except StageTransitionError:
        pass

def test_requires_approval_stages():
    engine = PipelineEngine()
    assert engine.requires_approval("analysis") is True
    assert engine.requires_approval("prd") is True
    assert engine.requires_approval("ui") is True
    assert engine.requires_approval("plan") is True
    assert engine.requires_approval("input") is False
    assert engine.requires_approval("dev") is False

def test_can_proceed_approved():
    engine = PipelineEngine()
    assert engine.can_proceed("analysis", "approved") is True
    assert engine.can_proceed("analysis", "pending") is False

def test_can_proceed_non_approval_stage():
    engine = PipelineEngine()
    assert engine.can_proceed("dev", "done") is True
    assert engine.can_proceed("dev", "running") is False
