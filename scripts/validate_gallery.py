#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Validate the published gallery metadata and generated JavaScript index."""

import argparse
import json
import re
import sys
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
FIGURES_JSON = ROOT / "data" / "figures.json"
FIGURES_JS = ROOT / "assets" / "figures.js"
VALID_VENUES = {"aaai", "acl", "cvpr", "iclr", "icml", "neurips"}
VALID_PATTERNS = {
    "architecture", "comparison", "conceptual", "framework", "pipeline",
    "results", "taxonomy", "teaser",
}
REQUIRED_FIELDS = {
    "id", "venue", "year", "title", "authors", "pattern", "image",
    "paper", "pdf_source", "w", "h",
}
ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\Z")
JS_PREFIX = "window.FIGURES = "


def is_http_url(value):
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot parse {path.relative_to(ROOT)}: {error}") from error


def load_generated_index():
    try:
        source = FIGURES_JS.read_text(encoding="utf-8")
    except OSError as error:
        raise ValueError(f"cannot read {FIGURES_JS.relative_to(ROOT)}: {error}") from error
    if not source.startswith(JS_PREFIX) or not source.rstrip().endswith(";"):
        raise ValueError("assets/figures.js must assign a JSON array to window.FIGURES")
    try:
        return json.loads(source[len(JS_PREFIX):].rstrip().rstrip(";"))
    except json.JSONDecodeError as error:
        raise ValueError(f"cannot parse generated assets/figures.js: {error}") from error


def validate(rows, check_images):
    errors = []
    if not isinstance(rows, list) or not rows:
        return ["data/figures.json must contain a non-empty JSON array"]

    seen_ids = set()
    seen_images = set()
    for index, figure in enumerate(rows, start=1):
        label = f"row {index}"
        if not isinstance(figure, dict):
            errors.append(f"{label}: expected an object")
            continue
        missing = REQUIRED_FIELDS - figure.keys()
        if missing:
            errors.append(f"{label}: missing fields: {', '.join(sorted(missing))}")
            continue

        figure_id = figure["id"]
        venue = figure["venue"]
        image = figure["image"]
        if not isinstance(figure_id, str) or not ID_RE.fullmatch(figure_id):
            errors.append(f"{label}: invalid id {figure_id!r}")
        elif figure_id in seen_ids:
            errors.append(f"{label}: duplicate id {figure_id}")
        else:
            seen_ids.add(figure_id)

        if venue not in VALID_VENUES:
            errors.append(f"{label}: invalid venue {venue!r}")
        if figure["pattern"] not in VALID_PATTERNS:
            errors.append(f"{label}: invalid pattern {figure['pattern']!r}")
        if not isinstance(figure["year"], int) or not 2000 <= figure["year"] <= 2100:
            errors.append(f"{label}: year must be an integer between 2000 and 2100")
        if not isinstance(figure["title"], str) or not figure["title"].strip():
            errors.append(f"{label}: title must be non-empty text")
        if not isinstance(figure["authors"], list) or not all(isinstance(author, str) for author in figure["authors"]):
            errors.append(f"{label}: authors must be an array of strings")
        for field in ("w", "h"):
            if not isinstance(figure[field], int) or figure[field] <= 0:
                errors.append(f"{label}: {field} must be a positive integer")
        for field in ("paper", "pdf_source"):
            if not isinstance(figure[field], str) or not is_http_url(figure[field]):
                errors.append(f"{label}: {field} must be an http(s) URL")

        expected_image = f"images/{venue}/final/{figure_id}.jpg"
        if image != expected_image:
            errors.append(f"{label}: image must be {expected_image}")
        elif image in seen_images:
            errors.append(f"{label}: duplicate image path {image}")
        else:
            seen_images.add(image)
        if check_images and not (ROOT / image).is_file():
            errors.append(f"{label}: referenced image is missing: {image}")

    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skip-images", action="store_true",
        help="skip image existence checks for partial or sparse checkouts",
    )
    args = parser.parse_args()

    try:
        rows = load_json(FIGURES_JSON)
        generated_rows = load_generated_index()
    except ValueError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1

    errors = validate(rows, check_images=not args.skip_images)
    if generated_rows != rows:
        errors.append("assets/figures.js is out of sync with data/figures.json; run scripts/assemble_gallery.py")
    if errors:
        print("Gallery validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    suffix = " (image checks skipped)" if args.skip_images else ""
    print(f"Gallery validation passed: {len(rows)} figures.{suffix}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
