import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { GtfsRealtimeService } from './src/transport/gtfs-realtime.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const gtfsRt = app.get(GtfsRealtimeService);
  
  const vehicles = await gtfsRt.getVehiclePositions('sydneytrains');
  
  console.log('Sample vehicles:', vehicles.slice(0, 5).map(v => ({tripId: v.tripId, routeId: v.routeId, startTime: v.startTime})));
  
  await app.close();
}
bootstrap();
