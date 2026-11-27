import type { Output, Parsed } from "@mybook/contracts";
import type { Locale } from "@/i18n/config";
import type { Messages } from "@/i18n/messages";
import type { PhotoChange } from "@/modules/feedback";
import type { LandingVisitInput } from "@/modules/marketing/application";
import type {
  GiftPaymentView,
  GiftPdfData,
  GiftStatusSource,
  LetterInviteSource,
  PublicAnswerFileData,
  RedeemCheckSource,
  RedeemGiftSource,
  ReviewPageDetailsSource,
  ReviewPageStateSource,
  ReviewPhotoRecord,
  ShowcaseReviewItem,
  SiteChatMessageDto,
  SubmittedReviewResult,
} from "@/shared/public-routes";

/** Порты Контекста 3 («Публичное и маркетинг») к смежным контекстам и переходному слою legacy. */
export const PUBLIC_PORTS = Symbol("PublicPorts");

export interface PublicWidgetConfig {
  enabled: boolean;
  chat: boolean;
  whatsapp: string;
}

export interface PublicInviteWelcome {
  code: string;
  percent: number;
  from: string;
}

export type PublicGiftPurchaseInput = Parsed<"webGiftCreate">["body"] & {
  buyerUserId: string | null;
};

export interface PublicLetterSubmitInput {
  authorName: string;
  relation: string;
  text: string;
}

export interface PublicReviewSubmitInput {
  rating: number;
  text: string;
  authorName: string;
  city: string;
  consent: boolean;
}

export interface PublicSiteChatPostInput {
  token: string;
  text: string;
  name?: string;
  phone?: string;
  page?: string;
  userId: string | null;
  userName?: string;
}

export interface PublicCallbackInput {
  name: string;
  phone: string;
  comment?: string;
  page?: string;
  userId: string | null;
}

export interface PublicPorts {
  readCatalogSettings(): Promise<Output<"webSiteCatalog">>;
  ensureCatalog(): Promise<void>;
  widgetConfig(): Promise<PublicWidgetConfig>;
  shopWhatsapp(): Promise<string>;
  reviewsShowcase(limit: number, theme?: string): Promise<ShowcaseReviewItem[]>;
  reviewsSummary(theme?: string): Promise<{ count: number; average: number }>;
  reviewPhoto(reviewId: string): Promise<ReviewPhotoRecord | null>;
  reviewPhotoFile(key: string): Promise<Uint8Array>;
  orderDetails(orderId: string): Promise<ReviewPageDetailsSource | null>;
  isOrderOwner(orderId: string, userId: string): Promise<boolean>;
  openReview(orderId: string): Promise<ReviewPageStateSource>;
  submitReview(orderId: string, input: PublicReviewSubmitInput, photo: PhotoChange): Promise<SubmittedReviewResult>;
  inviteWelcome(code: string): Promise<PublicInviteWelcome | null>;
  followShortLink(slug: string, userAgent: string): Promise<string | null>;
  giftByToken(token: string): Promise<GiftStatusSource | null>;
  giftPaymentProps(giftId: string, buyerPhone: string, messages: Messages): Promise<GiftPaymentView>;
  redeemUrl(code: string, locale: Locale): string;
  purchaseGift(input: PublicGiftPurchaseInput): Promise<{ token: string; amount: number }>;
  claimGiftPayment(token: string): Promise<{ token: string } | null>;
  checkPromo(code: string): Promise<RedeemCheckSource>;
  giftByPromo(promoId: string): Promise<RedeemGiftSource | null>;
  giftPdf(token: string): Promise<GiftPdfData | null>;
  bookByInviteToken(token: string): Promise<LetterInviteSource | null>;
  submitLetter(token: string, input: PublicLetterSubmitInput): Promise<void>;
  isValidUnsubscribeLink(userId: string, token: string): boolean;
  unsubscribe(userId: string, token: string): Promise<void>;
  publicAnswerFile(token: string): Promise<PublicAnswerFileData | null>;
  siteMessages(token: string, after?: Date): Promise<SiteChatMessageDto[]>;
  postSiteChat(input: PublicSiteChatPostInput): Promise<void>;
  requestCallback(input: PublicCallbackInput): Promise<void>;
  calendarFeed(token: string): Promise<string | null>;
  chatAvatarFile(file: string): Promise<Uint8Array | null>;
  /** Переход на рекламный лендинг (контекст Marketing). */
  recordLandingVisit(input: LandingVisitInput, event: "view" | "click"): Promise<void>;
}
