# Simulate & predict: curated what-if scenarios (data/whatif/scenarios/*.json) and the Order and Chaos
# backtest scorecard (data/order-chaos/backtest.json). The per-polity fragility scores are already on the
# page as ORDER.polities, so only the summary numbers travel here.
import glob, json, os


def build(repo):
    scen = [json.load(open(f, encoding='utf-8')) for f in sorted(glob.glob(os.path.join(repo, 'data', 'whatif', 'scenarios', '*.json')))]
    bt = json.load(open(os.path.join(repo, 'data', 'order-chaos', 'backtest.json'), encoding='utf-8'))
    cf, base, ts, ew = bt['cross_fit'], bt['baseline_age_era'], bt['time_split_pre1500_to_post1500'], bt['early_warning']
    return {
        'scenarios': scen,
        'bt': {
            'thr': ew['threshold'], 'base': cf['base_rate'], 'auc': cf['auc'], 'auc_base': base['auc'], 'auc_modern': ts['auc'],
            'lift': cf['lift'], 'precision': cf['precision_when_flagged'], 'n': cf['n'], 'breaks': cf['breaks'],
            'warned': ew['flagged_5_to_40y_before'], 'by_style': ew['by_style'], 'calibration': cf['calibration'],
            'coef': bt['coefficients_standardised'], 'caveats': bt['caveats'], 'sources': bt['sources'],
        },
    }
