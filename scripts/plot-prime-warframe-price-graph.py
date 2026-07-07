from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    rows = payload["rows"]

    names = [row["name"] for row in rows]
    set_prices = [row["setPrice"] for row in rows]
    part_totals = [row["partEstimatedTotal"] for row in rows]
    y_positions = list(range(len(rows)))
    bar_height = 0.38

    figure_height = max(8, len(rows) * 0.34)
    fig, ax = plt.subplots(figsize=(16, figure_height))
    fig.patch.set_facecolor("#fbf8f1")
    ax.set_facecolor("#fbf8f1")

    ax.barh(
        [position - bar_height / 2 for position in y_positions],
        set_prices,
        height=bar_height,
        label="Set price",
        color="#1d4ed8",
    )
    ax.barh(
        [position + bar_height / 2 for position in y_positions],
        part_totals,
        height=bar_height,
        label="Part est",
        color="#d97706",
    )

    ax.set_yticks(y_positions, names, fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel("Platinum")
    ax.set_title("Prime Warframe Set Price vs Part Estimate")
    ax.grid(axis="x", alpha=0.25, linestyle="--")
    ax.legend(loc="lower right")

    max_value = max(set_prices + part_totals)
    ax.set_xlim(0, max_value * 1.12)

    for position, value in zip(
        [position - bar_height / 2 for position in y_positions],
        set_prices,
    ):
        ax.text(value + max_value * 0.01, position, f"{value}p", va="center", fontsize=8)

    for position, value in zip(
        [position + bar_height / 2 for position in y_positions],
        part_totals,
    ):
        ax.text(value + max_value * 0.01, position, f"{value}p", va="center", fontsize=8)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.tight_layout()
    fig.savefig(output_path, dpi=200, bbox_inches="tight")


if __name__ == "__main__":
    main()
