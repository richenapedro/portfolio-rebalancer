from pathlib import Path

from portfolio_rebalancer.cli import main


def test_cli_rebalance_show_post(tmp_path: Path, capsys):
    positions = tmp_path / "positions.csv"
    targets = tmp_path / "targets.csv"
    prices = tmp_path / "prices.csv"

    positions.write_text(
        "ticker,asset_type,quantity,price\n" "AAA,STOCK,10,100\n" "BBB,STOCK,5,200\n",
        encoding="utf-8",
    )
    targets.write_text(
        "ticker,weight\n" "AAA,0.75\n" "BBB,0.25\n",
        encoding="utf-8",
    )
    prices.write_text(
        "ticker,price\n" "AAA,100\n" "BBB,200\n",
        encoding="utf-8",
    )

    code = main(
        [
            "rebalance",
            "--positions",
            str(positions),
            "--targets",
            str(targets),
            "--prices",
            str(prices),
            "--cash",
            "100",
            "--mode",
            "TRADE",
            "--show-post",
        ]
    )
    assert code == 0

    out = capsys.readouterr().out
    assert "POST_PORTFOLIO" in out
    assert "POST_CASH," in out
    assert "POST_TOTAL_VALUE," in out
    assert "POST_POSITION," in out


def test_cli_rebalance_smoke(tmp_path: Path, capsys):
    positions = tmp_path / "positions.csv"
    targets = tmp_path / "targets.csv"
    prices = tmp_path / "prices.csv"

    positions.write_text(
        "ticker,asset_type,quantity,price\n" "AAA,STOCK,10,100\n" "BBB,STOCK,5,200\n",
        encoding="utf-8",
    )
    targets.write_text(
        "ticker,weight\n" "AAA,0.75\n" "BBB,0.25\n",
        encoding="utf-8",
    )
    prices.write_text(
        "ticker,price\n" "AAA,100\n" "BBB,200\n",
        encoding="utf-8",
    )

    code = main(
        [
            "rebalance",
            "--positions",
            str(positions),
            "--targets",
            str(targets),
            "--prices",
            str(prices),
            "--cash",
            "100",
            "--mode",
            "TRADE",
        ]
    )
    assert code == 0

    out = capsys.readouterr().out.strip().splitlines()
    # só checa que imprimiu algo com trades + cash
    assert any(line.startswith("SELL,") for line in out)
    assert any(line.startswith("BUY,") for line in out)
    assert any(line.startswith("CASH_AFTER,") for line in out)
