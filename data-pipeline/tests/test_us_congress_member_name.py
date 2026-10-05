"""의원 이름 조립(fetch_us_congress.member_name) — 하원 색인의 호칭 · 겹친 낱말을 걷는다(2026-10-04 점검)."""
import fetch_us_congress as cg


def test_honorific_and_duplicate():
    assert cg.member_name("Richard Dean Dr", "McCormick") == "Richard Dean McCormick"
    assert cg.member_name("John J Mr", "McGuire") == "John J McGuire"
    assert cg.member_name("Scott Scott", "Franklin") == "Scott Franklin"
    assert cg.member_name("Hon. Nancy", "Pelosi") == "Nancy Pelosi"


def test_plain_names_unchanged():
    assert cg.member_name("Marjorie Taylor", "Greene") == "Marjorie Taylor Greene"
    assert cg.member_name("", "Smith") == "Smith"
