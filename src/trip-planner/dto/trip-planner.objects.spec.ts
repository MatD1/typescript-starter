import { DepartureObject, LegObject } from './trip-planner.objects';

describe('TripPlanner DTOs', () => {
  it('DepartureObject should have lineCode and routeColour properties', () => {
    const departure = new DepartureObject();
    departure.lineCode = 'T1';
    departure.routeColour = '009B77';
    expect(departure.lineCode).toBe('T1');
    expect(departure.routeColour).toBe('009B77');
  });

  it('LegObject should have lineCode and routeColour properties', () => {
    const leg = new LegObject();
    leg.lineCode = 'T1';
    leg.routeColour = '009B77';
    expect(leg.lineCode).toBe('T1');
    expect(leg.routeColour).toBe('009B77');
  });
});
