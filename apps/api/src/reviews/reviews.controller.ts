import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ReviewsService } from "./reviews.service.js";

@Controller("reviews")
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get("invitations/:token")
  invitation(@Param("token") token: string) {
    return this.reviews.invitation(token);
  }

  @Post("invitations/:token")
  submit(
    @Param("token") token: string,
    @Body() body: {
      orderItemId?: string;
      rating?: number;
      title?: string;
      body?: string;
      reviewerName?: string;
    },
  ) {
    return this.reviews.submit(token, body ?? {});
  }

  @Get("products/:productId")
  productReviews(@Param("productId") productId: string) {
    return this.reviews.productReviews(productId);
  }
}
