"""Synthetic fixtures only: these tests do not constitute NASA validation."""
import unittest
import numpy as np
from siteforge.engine import Terrain, angular_interpolate, windows, optimize, reproject_ephemeris, ecef


def fixture(z=None,n=101):
    # Small equatorial spherical patch with ~5 m sample spacing.
    row,col=np.indices((n,n))
    scale=np.degrees(5/1737400)
    return Terrain(np.zeros((n,n)) if z is None else z,(col-n//2)*scale,(n//2-row)*scale)


def records(elevation=1):
    return [dict(timestamp_utc=f'2026-01-01T0{h}:00:00+00:00',azimuth_deg=90.,elevation_deg=elevation) for h in range(4)]


class EngineTests(unittest.TestCase):
    def test_ecef_units(self):
        np.testing.assert_allclose(ecef(0,0,1737400),[1737400,0,0])

    def test_spherical_flat_horizon_below_tangent(self):
        t=fixture()
        h=t.horizon(50,50)
        self.assertLess(max(h['elevation_deg']),0)
        self.assertGreater(min(h['elevation_deg']),-.1)

    def test_height_never_raises_horizon(self):
        z=np.zeros((101,101));z[:,65]=12
        t=fixture(z)
        a=np.array(t.horizon(50,50,0)['elevation_deg'])
        b=np.array(t.horizon(50,50,20)['elevation_deg'])
        self.assertTrue(np.all(b<=a+1e-10))
        self.assertGreater(a[90],5)
        self.assertLess(b[90],a[90])

    def test_periodic_interpolation(self):
        h=np.zeros(360);h[359]=2
        self.assertAlmostEqual(float(angular_interpolate(359.5,h)),1)
        self.assertAlmostEqual(float(angular_interpolate(-.5,h)),1)

    def test_windows_no_extra_last_interval(self):
        times=[r['timestamp_utc'] for r in records()]
        w=windows(times,[True,False,True,True])
        self.assertEqual(w['total_hours'],2)
        self.assertEqual(w['duration_hours'],3)
        self.assertEqual(w['longest_outage_hours'],1)
        self.assertEqual(w['interval_count'],2)
        self.assertEqual(w['intervals'][-1]['end_utc'],times[-1])

    def test_irregular_sampling_and_boundaries(self):
        t=['2026-01-01T00:00:00Z','2026-01-01T00:30:00Z','2026-01-01T02:00:00Z']
        self.assertEqual(windows(t,[False,False,True])['longest_outage_hours'],2)
        self.assertEqual(windows(t,[True,True,False])['total_hours'],2)
        with self.assertRaises(ValueError):windows(t[::-1],[True]*3)

    def test_nodata_rejected_and_edge_coverage(self):
        z=np.zeros((101,101));z[50,50]=np.nan
        t=fixture(z)
        with self.assertRaises(ValueError):t.point(50,50)
        with self.assertRaises(ValueError):t.horizon(0,0)
        with self.assertRaises(ValueError):t.point(-1,0)

    def test_visibility_reacts_to_height(self):
        z=np.zeros((101,101));z[:,65]=12
        t=fixture(z)
        base=t.evaluate(50,50,0,records(),records())
        tower=t.evaluate(50,50,20,records(),records())
        self.assertEqual(base['metrics']['sun']['total_hours'],0)
        self.assertEqual(tower['metrics']['sun']['total_hours'],3)

    def test_local_link_ridge_and_clearance(self):
        z=np.zeros((101,101));z[:,50]=10
        t=fixture(z)
        self.assertFalse(t.local_link((50,30),(50,70),2,2)['visible'])
        self.assertTrue(t.local_link((50,30),(50,70),20,20)['visible'])
        self.assertAlmostEqual(t.local_link((50,30),(50,70),20,20)['distance_m'],200,places=3)

    def test_curvature_blocks_ground_chord(self):
        t=fixture()
        self.assertFalse(t.local_link((50,10),(50,90),0,0)['visible'])
        self.assertTrue(t.local_link((50,10),(50,90),2,2)['visible'])

    def test_optimizer_hard_constraints_and_order(self):
        t=fixture(); candidates=[(50,50),(40,40)]
        ep={p:dict(sun=records(),earth=records()) for p in candidates}
        r=optimize(t,candidates,ep,(50,50),dict(min_sun_hours=2),heights=(0,2))
        self.assertEqual(r['recommended']['height_m'],0)
        self.assertEqual(r['recommended']['position']['row'],50)
        self.assertEqual(r['evaluated_configurations'],4)
        self.assertEqual(r['recommended'],optimize(t,candidates[::-1],ep,(50,50),dict(min_sun_hours=2),heights=(2,0))['recommended'])
        bad=optimize(t,candidates,ep,(50,50),dict(min_sun_hours=4))
        self.assertEqual(bad['status'],'infeasible')
        self.assertIsNone(bad['recommended'])

    def test_optimizer_local_link_is_hard_constraint(self):
        t=fixture();p=(50,60)
        result=optimize(t,[p],{p:dict(sun=records(),earth=records())},(50,50),dict(require_local_link=True),heights=(2,))
        self.assertTrue(result['recommended']['local_link']['visible'])

    def test_reprojection_roundtrip(self):
        r=records()
        a=reproject_ephemeris(r,30,-89,31,-89.01)
        b=reproject_ephemeris(a,31,-89.01,30,-89)
        self.assertAlmostEqual(b[0]['elevation_deg'],r[0]['elevation_deg'],places=10)
        self.assertAlmostEqual(b[0]['azimuth_deg'],r[0]['azimuth_deg'],places=10)
        self.assertNotEqual(a[0]['azimuth_deg'],r[0]['azimuth_deg'])

    def test_regional_obstacle_is_combined_with_local_horizon(self):
        local=fixture()
        regional=dict(elevation_m=np.array([100.]),longitude_deg=np.array([np.degrees(500/1737400)]),latitude_deg=np.array([0.]),radius_m=1737400.)
        combined=Terrain(local.elevation_m,local.longitude_deg,local.latitude_deg,regional=regional)
        baseline=np.array(local.horizon(50,50)['elevation_deg'])
        merged=np.array(combined.horizon(50,50)['elevation_deg'])
        raised=np.array(combined.horizon(50,50,20)['elevation_deg'])
        self.assertGreater(merged[90],10)
        self.assertTrue(np.all(merged>=baseline))
        self.assertTrue(np.all(raised<=merged))
        self.assertIn('regional',combined.coverage)

    def test_regional_reference_radius_must_match(self):
        t=fixture()
        regional=dict(elevation_m=[10.],longitude_deg=[.1],latitude_deg=[0.],radius_m=1737000.)
        with self.assertRaises(ValueError):
            Terrain(t.elevation_m,t.longitude_deg,t.latitude_deg,regional=regional)

    def test_slope_and_flat(self):
        t=fixture()
        self.assertEqual(t.point(50,50)['slope_deg'],0)
        z=np.indices((101,101))[1]*.5
        t=fixture(z)
        self.assertAlmostEqual(t.point(50,50)['slope_deg'],np.degrees(np.arctan(.1)),delta=.04)

if __name__=='__main__':unittest.main()
