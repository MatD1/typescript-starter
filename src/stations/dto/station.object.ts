import { Field, Float, Int, ObjectType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GtfsRouteObject } from '../../gtfs-static/dto/gtfs-static.objects';

@ObjectType()
export class StationObject {
  @ApiProperty({ description: 'GTFS Stop ID' })
  @Field()
  stopId!: string;

  @ApiProperty({ description: 'Full name of the station/stop' })
  @Field()
  stopName!: string;

  @ApiPropertyOptional({ description: 'Stop code (usually same as ID)' })
  @Field({ nullable: true })
  stopCode?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @Field(() => Float, { nullable: true })
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @Field(() => Float, { nullable: true })
  lon?: number;

  @ApiPropertyOptional({ description: '0=stop, 1=station, 2=entrance, 3=generic, 4=boarding' })
  @Field(() => Int, { nullable: true })
  locationType?: number;

  @ApiPropertyOptional({ description: 'ID of the parent station' })
  @Field({ nullable: true })
  parentStation?: string;

  @ApiPropertyOptional({ description: '0=no info, 1=accessible, 2=not accessible' })
  @Field(() => Int, { nullable: true })
  wheelchairBoarding?: number;

  @ApiPropertyOptional({ description: 'Platform or stand code' })
  @Field({ nullable: true })
  platformCode?: string;

  @ApiPropertyOptional({ description: 'Transport mode' })
  @Field({ nullable: true })
  mode?: string;

  @ApiPropertyOptional({
    description: 'Routes that serve this station',
    type: [GtfsRouteObject],
  })
  @Field(() => [GtfsRouteObject], { nullable: true })
  routes?: GtfsRouteObject[];
}
