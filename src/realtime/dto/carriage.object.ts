import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Per-carriage composition and occupancy (TfNSW extension)' })
export class CarriageDescriptorObject {
  @Field({ nullable: true })
  name?: string;

  @Field(() => Int, { description: 'Position of this carriage within the consist (1-based)' })
  positionInConsist!: number;

  @Field({ nullable: true, description: 'Current occupancy status of this carriage' })
  occupancyStatus?: string;

  @Field({ nullable: true, description: 'Whether this is a designated quiet carriage' })
  quietCarriage?: boolean;

  @Field({ nullable: true, description: 'Toilet availability: NONE | NORMAL | ACCESSIBLE' })
  toilet?: string;

  @Field({ nullable: true, description: 'Whether this carriage has a luggage rack' })
  luggageRack?: boolean;

  @Field({ nullable: true, description: 'Predicted occupancy status at next departure' })
  departureOccupancyStatus?: string;
}
