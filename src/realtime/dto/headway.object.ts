import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum HeadwayStatus {
    BUNCHED = 'bunched',
    COMPRESSING = 'compressing',
    HEALTHY = 'healthy',
    GAPPED = 'gapped',
    UNKNOWN = 'unknown',
}

registerEnumType(HeadwayStatus, {
    name: 'HeadwayStatus',
    description: 'Classification of spacing between consecutive vehicles',
});

@ObjectType()
export class VehicleHeadwayObject {
    @ApiProperty()
    @Field()
    vehicleId!: string;

    @ApiPropertyOptional({ description: 'Seconds since the vehicle ahead' })
    @Field(() => Int, { nullable: true })
    gapSeconds?: number;

    @ApiProperty({ enum: HeadwayStatus })
    @Field(() => HeadwayStatus)
    status!: HeadwayStatus;
}

@ObjectType()
export class RouteHeadwayObject {
    @ApiProperty()
    @Field()
    routeId!: string;

    @ApiPropertyOptional()
    @Field(() => Int, { nullable: true })
    directionId?: number;

    @ApiProperty({ type: () => [VehicleHeadwayObject] })
    @Field(() => [VehicleHeadwayObject])
    vehicles!: VehicleHeadwayObject[];
}
