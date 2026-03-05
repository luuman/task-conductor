# backend/app/pipeline/schemas.py
from pydantic import BaseModel, Field
from typing import Literal, Any


class AnalysisOption(BaseModel):
    label: Literal["A", "B", "C"]
    title: str
    effort: Literal["S", "M", "L", "XL"]
    risk: Literal["低", "中", "高"]
    description: str


class AnalysisOutput(BaseModel):
    understanding: str = Field(description="对需求的核心理解，1-2句话")
    assumptions: list[str] = Field(description="明确列出所有假设", min_length=1)
    risks: list[str] = Field(description="识别到的风险点")
    options: list[AnalysisOption] = Field(min_length=3, max_length=3)
    recommended: Literal["A", "B", "C"]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])


class CriticOutput(BaseModel):
    score: int = Field(ge=0, le=10)
    issues: list[str]
    suggestions: str
    pass_review: bool


class PrdOutput(BaseModel):
    title: str
    background: str
    user_stories: list[str]
    acceptance_criteria: list[str]
    out_of_scope: list[str]
    assumptions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])


class PlanOutput(BaseModel):
    architecture: str
    components: list[dict[str, Any]]      # [{name, responsibility, tech}]
    milestones: list[dict[str, Any]]      # [{name, tasks:[str], estimate}]
    tech_decisions: list[dict[str, Any]]  # [{decision, rationale, alternatives}]
    assumptions: list[str]
    confidence: float = Field(ge=0.0, le=1.0)
    blockers: list[str] = Field(default=[])
