import unittest

from scripts.optuna_optimizer import detect_regime_shift, infer_market_regime


class OptunaRegimeTests(unittest.TestCase):
    def test_infer_market_regime_high_vol_trending(self):
        regime = infer_market_regime({
            "annualizedReturn": 0.18,
            "volatility": 0.30,
            "sharpeRatio": 0.92,
        })
        self.assertEqual(regime["volatility_regime"], "high")
        self.assertEqual(regime["trend_regime"], "trending")
        self.assertEqual(regime["direction"], "bullish")

    def test_infer_market_regime_low_vol_ranging(self):
        regime = infer_market_regime({
            "annualizedReturn": 0.04,
            "volatility": 0.12,
            "sharpeRatio": 0.25,
        })
        self.assertEqual(regime["volatility_regime"], "low")
        self.assertEqual(regime["trend_regime"], "ranging")
        self.assertEqual(regime["direction"], "bullish")

    def test_detect_regime_shift(self):
        in_regime = infer_market_regime({
            "annualizedReturn": 0.16,
            "volatility": 0.26,
            "sharpeRatio": 0.80,
        })
        out_regime = infer_market_regime({
            "annualizedReturn": -0.08,
            "volatility": 0.14,
            "sharpeRatio": 0.20,
        })
        shift = detect_regime_shift(in_regime, out_regime)
        self.assertTrue(shift["shifted"])
        self.assertIn("volatility_regime", shift["changed_keys"])
        self.assertIn("direction", shift["changed_keys"])


if __name__ == "__main__":
    unittest.main()
