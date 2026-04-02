import unittest

from scripts.optuna_optimizer import _pearson_corr, compute_factor_stability_metrics


class OptunaFactorStabilityTests(unittest.TestCase):
    def test_pearson_corr_basic(self):
        corr = _pearson_corr([1, 2, 3, 4], [2, 4, 6, 8])
        self.assertIsNotNone(corr)
        self.assertGreater(corr, 0.99)

    def test_pearson_corr_invalid(self):
        self.assertIsNone(_pearson_corr([1], [1]))
        self.assertIsNone(_pearson_corr([1, 1, 1], [2, 3, 4]))

    def test_factor_stability_not_applicable(self):
        result = compute_factor_stability_metrics(
            strategy_type="double_ma",
            stocks=["000001.SZ"],
            start_date="2024-01-01",
            end_date="2024-01-31",
        )
        self.assertEqual(result.get("status"), "not_applicable")


if __name__ == "__main__":
    unittest.main()
