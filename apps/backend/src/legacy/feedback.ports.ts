import type { Provider } from "@nestjs/common";
import type { Container } from "@/server/container";
import { FEEDBACK_PORTS, type FeedbackPorts } from "../modules/feedback/feedback.tokens";
import { LEGACY_CONTAINER } from "./legacy.tokens";

/** Порты Feedback, пока Ordering и Workspace не переехали: те же адаптеры, что у старого фасада (container.feedbackPorts). */
export const legacyFeedbackPorts: Provider<FeedbackPorts> = {
  provide: FEEDBACK_PORTS,
  useFactory: (c: Container) => c.feedbackPorts,
  inject: [LEGACY_CONTAINER],
};
