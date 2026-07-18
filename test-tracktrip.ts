import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { RealtimeService } from './src/realtime/realtime.service';
import { GtfsRealtimeService } from './src/transport/gtfs-realtime.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const gtfsRt = app.get(GtfsRealtimeService);
  const rtService = app.get(RealtimeService);
  
  const vehicles = await gtfsRt.getVehiclePositions('sydneytrains');
  if (vehicles.length === 0) {
     console.log('No sydneytrains vehicles');
     return;
  }
  
  // take a real tripId from the feed
  const liveTripId = vehicles[0].tripId;
  console.log('Trying to track live trip ID:', liveTripId);
  
  const result = await rtService.trackTrip(liveTripId, 'sydneytrains', {});
  console.log('Result:', result !== null ? 'FOUND' : 'NOT FOUND');
  if (result) console.log(result.position);
  
  await app.close();
}
bootstrap();
