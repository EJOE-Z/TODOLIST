# -*- coding: utf-8 -*-
"""
将项目特色功能介绍 Markdown 正文生成 PDF。
"""
from __future__ import annotations

import re
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def register_fonts() -> tuple[str, str]:
    """
    注册系统中文字体。
    @returns 正文字体名与等宽字体名
    """
    regular = r"C:\Windows\Fonts\msyh.ttc"
    mono = r"C:\Windows\Fonts\simhei.ttf"
    pdfmetrics.registerFont(TTFont("YaHei", regular, subfontIndex=0))
    pdfmetrics.registerFont(TTFont("SimHei", mono))
    return "YaHei", "SimHei"


def build_styles(body_font: str, mono_font: str) -> dict[str, ParagraphStyle]:
    """
    构建 PDF 段落样式。
    @returns 样式字典
    """
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle(
            "title",
            parent=base["Title"],
            fontName=body_font,
            fontSize=16,
            leading=22,
            spaceAfter=12,
        ),
        "meta": ParagraphStyle(
            "meta",
            parent=base["Normal"],
            fontName=body_font,
            fontSize=10.5,
            leading=16,
            spaceAfter=6,
        ),
        "heading": ParagraphStyle(
            "heading",
            parent=base["Heading2"],
            fontName=body_font,
            fontSize=13,
            leading=18,
            spaceBefore=10,
            spaceAfter=6,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base["Normal"],
            fontName=body_font,
            fontSize=11,
            leading=18,
            spaceAfter=6,
            firstLineIndent=22,
        ),
        "mono": ParagraphStyle(
            "mono",
            parent=base["Code"],
            fontName=mono_font,
            fontSize=9,
            leading=13,
            spaceAfter=2,
            leftIndent=12,
        ),
    }


def escape_xml(text: str) -> str:
    """
    转义 XML 特殊字符供 Paragraph 使用。
    @returns 转义后的文本
    """
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def parse_markdown_to_flowables(
    text: str,
    styles: dict[str, ParagraphStyle],
) -> list:
    """
    将简化 Markdown 文本转为 reportlab flowables。
    @returns 段落列表
    """
    flowables: list = []
    in_code = False
    code_lines: list[str] = []

    meta_prefixes = ("课程：", "项目：", "说明：")
    sub_heading_prefixes = (
        "特色功能",
        "关键差距",
        "课表感知",
        "今日智能",
        "通用方案",
    )

    for raw_line in text.splitlines():
        line = raw_line.rstrip()

        if line.strip().startswith("```"):
            if in_code:
                for code_line in code_lines:
                    flowables.append(Paragraph(escape_xml(code_line) or " ", styles["mono"]))
                code_lines = []
                in_code = False
                flowables.append(Spacer(1, 0.15 * cm))
            else:
                in_code = True
            continue

        if in_code:
            code_lines.append(line)
            continue

        if not line.strip():
            flowables.append(Spacer(1, 0.2 * cm))
            continue

        if re.match(r"^5\.\d", line):
            flowables.append(Paragraph(escape_xml(line), styles["heading"]))
            continue

        if line.startswith("作业 9"):
            flowables.append(Paragraph(escape_xml(line), styles["title"]))
            continue

        if line.startswith(meta_prefixes):
            flowables.append(Paragraph(escape_xml(line), styles["meta"]))
            continue

        if line.startswith(sub_heading_prefixes):
            flowables.append(Paragraph(escape_xml(line), styles["heading"]))
            continue

        if re.match(r"^\s{4,}\S", line) or line.startswith("    "):
            flowables.append(Paragraph(escape_xml(line), styles["mono"]))
            continue

        flowables.append(Paragraph(escape_xml(line), styles["body"]))

    return flowables


def generate_pdf(md_path: Path, pdf_path: Path) -> None:
    """
    从 Markdown 文件生成 PDF。
    """
    body_font, mono_font = register_fonts()
    styles = build_styles(body_font, mono_font)
    content = md_path.read_text(encoding="utf-8")
    flowables = parse_markdown_to_flowables(content, styles)

    doc = SimpleDocTemplate(
        str(pdf_path),
        pagesize=A4,
        leftMargin=2.2 * cm,
        rightMargin=2.2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
    )
    doc.build(flowables)


if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    md_file = root / "项目特色功能介绍-智能TODO清单.md"
    pdf_file = root / "项目特色功能介绍-智能TODO清单.pdf"
    generate_pdf(md_file, pdf_file)
    print(f"已生成: {pdf_file}")
