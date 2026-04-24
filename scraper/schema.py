"""Pydantic models for the India HEI Job Tracker."""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field, HttpUrl


class InstitutionType(str, Enum):
    IIT = "IIT"
    IIM = "IIM"
    IISER = "IISER"
    IISc = "IISc"
    CU = "CentralUniversity"
    NIT = "NIT"
    IIIT = "IIIT"
    AIIMS = "AIIMS"
    Other = "Other"


class StatuteBasis(str, Enum):
    IITAct1961 = "IITAct1961"
    IIMAct2017 = "IIMAct2017"
    NITAct2007 = "NITAct2007"
    UGCAct1956 = "UGCAct1956"
    CentralUnivsAct2009 = "CentralUnivsAct2009"
    IIIAct2014 = "IIIAct2014"
    Individual = "Individual"


class AdFormat(str, Enum):
    HTML = "HTML"
    PDFOnly = "PDFOnly"
    Samarth = "Samarth"
    Mixed = "Mixed"
    Unknown = "Unknown"


class CoverageStatus(str, Enum):
    Active = "Active"
    Stub = "Stub"
    Broken = "Broken"
    SamarthOnly = "SamarthOnly"
    Unverified = "Unverified"


class PostType(str, Enum):
    Faculty = "Faculty"
    NonFaculty = "NonFaculty"
    Scientific = "Scientific"
    Administrative = "Administrative"
    Research = "Research"
    Contract = "Contract"
    Unknown = "Unknown"


class ContractStatus(str, Enum):
    Regular = "Regular"
    TenureTrack = "TenureTrack"
    Contractual = "Contractual"
    Guest = "Guest"
    AdHoc = "AdHoc"
    Visiting = "Visiting"
    TFPP = "TFPP"
    TTAP = "TTAP"
    Unknown = "Unknown"


class CategoryBreakdown(BaseModel):
    UR: Optional[int] = None
    SC: Optional[int] = None
    ST: Optional[int] = None
    OBC: Optional[int] = None
    EWS: Optional[int] = None
    PwBD: Optional[int] = None


class Institution(BaseModel):
    id: str
    name: str
    short_name: str
    type: InstitutionType
    state: str
    city: str
    established: Optional[int] = None
    statute_basis: StatuteBasis = StatuteBasis.Individual
    career_page_urls: list[str] = Field(default_factory=list)
    ad_format: AdFormat = AdFormat.Unknown
    parser: str = "generic"
    last_verified: Optional[datetime] = None
    coverage_status: CoverageStatus = CoverageStatus.Unverified
    notes: str = ""


class JobAd(BaseModel):
    id: str
    institution_id: str
    ad_number: Optional[str] = None
    title: str
    department: Optional[str] = None
    discipline: Optional[str] = None
    post_type: PostType = PostType.Unknown
    contract_status: ContractStatus = ContractStatus.Unknown
    category_breakdown: CategoryBreakdown = Field(default_factory=CategoryBreakdown)
    number_of_posts: Optional[int] = None
    pay_scale: Optional[str] = None
    publication_date: Optional[date] = None
    closing_date: Optional[date] = None
    original_url: str  # canonical PDF/HTML URL on institution server
    snapshot_fetched_at: datetime
    parse_confidence: float = 0.5
    raw_text_excerpt: Optional[str] = None


class ParseError(Exception):
    """Raised when a parser cannot recover from a structural issue."""
