"""1판 아침 글의 키워드 나열(갈래 문단이 걸린 날의 대신)이 & 를 한 번만 이스케이프하는지.

그 줄은 paragraphs() → to_telegram_html() 을 지나며 이스케이프된다. 줄을 지을 때 키워드를 미리
html.escape 하면 두 번 걸려 채널에 'M&amp;A'·'S&amp;P500' 이 글자 그대로 보인다.
"""
from send_telegram_broadcast import as_read, keyword_line, paragraphs


def test_keywords_are_escaped_once():
    payload = paragraphs(keyword_line("어제", [("M&A", 12), ("S&P500", 9), ("<반도체>", 4)]))
    assert payload[-1] == "어제 오간 말: M&amp;A · S&amp;P500 · &lt;반도체&gt;"
    assert as_read("\n".join(payload)).strip() == "어제 오간 말: M&A · S&P500 · <반도체>"
