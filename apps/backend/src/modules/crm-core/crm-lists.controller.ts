import { Controller, Inject } from "@nestjs/common";
import type { Output, Parsed } from "@mybook/contracts";
import type { StaffMember } from "../../core/auth/staff";
import { CurrentStaff, Permissions } from "../../core/auth/staff.decorators";
import { ApiError } from "../../core/errors/api-error";
import { Input } from "../../core/http/decorators";
import { Endpoint } from "../../core/http/endpoint";
import { CRM_LISTS_PORTS, type CrmListsPorts } from "./crm-core.tokens";

/**
 * Контекст 4A — чтение списков и карточек CRM (15 маршрутов API v1: «Мой день», задачи, звонки, клиенты, сотрудники,
 * уведомления, чаты, сделки и заказы производства). Права и видимость «только свои» — паритетно с `crm-lists.ts`.
 */
@Controller()
export class CrmListsController {
  constructor(@Inject(CRM_LISTS_PORTS) private readonly lists: CrmListsPorts) {}

  @Endpoint("crmToday")
  today(@CurrentStaff() staff: StaffMember): Promise<Output<"crmToday">> {
    return this.lists.today(staff);
  }

  @Endpoint("crmTasksList")
  async tasksList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmTasksList">): Promise<Output<"crmTasksList">> {
    return {
      tasks: await this.lists.tasks(staff, {
        done: input.done === "1",
        who: input.who,
        kind: input.kind,
        q: input.q,
      }),
    };
  }

  @Endpoint("crmCallsList")
  @Permissions("calls.view")
  callsList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmCallsList">): Promise<Output<"crmCallsList">> {
    return this.lists.calls(staff, input.f ?? "all", input.days ?? 14);
  }

  @Endpoint("crmClientsList")
  @Permissions("clients.view")
  clientsList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmClientsList">): Promise<Output<"crmClientsList">> {
    return this.lists.clients(staff, {
      q: input.q,
      sort: input.sort ?? "new",
      page: input.page ?? 1,
      mine: input.mine === "1",
    });
  }

  @Endpoint("crmClientCard")
  @Permissions("clients.view")
  clientCard(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmClientCard">): Promise<Output<"crmClientCard">> {
    return this.lists.clientCard(staff, input.clientId);
  }

  @Endpoint("crmStaffList")
  staffList(@CurrentStaff() staff: StaffMember): Promise<Output<"crmStaffList">> {
    return this.lists.staffList(staff);
  }

  @Endpoint("crmNotificationsList")
  async notificationsList(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmNotificationsList">,
  ): Promise<Output<"crmNotificationsList">> {
    return { notifications: await this.lists.notifications(staff.user.id, input.limit ?? 60) };
  }

  @Endpoint("crmNotificationsRead")
  async notificationsRead(
    @CurrentStaff() staff: StaffMember,
    @Input() input: Parsed<"crmNotificationsRead">,
  ): Promise<Output<"crmNotificationsRead">> {
    await this.lists.markNotificationsRead(staff.user.id, input.body.id);
    return { ok: true };
  }

  @Endpoint("crmChatsList")
  @Permissions("chats.view")
  async chatsList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmChatsList">): Promise<Output<"crmChatsList">> {
    return { chats: await this.lists.chats(staff, input.f ?? "open", input.q) };
  }

  @Endpoint("crmChatGet")
  @Permissions("chats.view")
  chatGet(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmChatGet">): Promise<Output<"crmChatGet">> {
    return this.lists.chatDetail(staff, input.chatId, input.limit ?? 50);
  }

  @Endpoint("crmChatMessages")
  @Permissions("chats.view")
  async chatMessages(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmChatMessages">): Promise<Output<"crmChatMessages">> {
    const conv = await this.lists.conversation(input.chatId);
    if (!conv) throw new ApiError(404, "notFound");
    if (!staff.context.canSee(conv.assigneeId)) throw new ApiError(403, "forbidden");
    const before = input.before && !Number.isNaN(Date.parse(input.before)) ? new Date(input.before) : undefined;
    const page = await this.lists.chatMessages(conv.id, input.limit ?? 40, before);
    return { ...page, unread: conv.unread, status: conv.status };
  }

  @Endpoint("crmDealsList")
  @Permissions("deals.view")
  dealsList(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDealsList">): Promise<Output<"crmDealsList">> {
    return this.lists.deals(staff, {
      p: input.p,
      mine: input.mine,
      a: input.a,
      q: input.q,
      task: input.task,
      stale: input.stale,
      src: input.src,
    });
  }

  @Endpoint("crmDealGet")
  @Permissions("deals.view")
  dealGet(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmDealGet">): Promise<Output<"crmDealGet">> {
    return this.lists.dealDetail(staff, input.dealId);
  }

  @Endpoint("crmOrdersList")
  @Permissions("orders.view")
  ordersList(@CurrentStaff() staff: StaffMember): Promise<Output<"crmOrdersList">> {
    return this.lists.orders(staff);
  }

  @Endpoint("crmOrder")
  @Permissions("orders.view")
  order(@CurrentStaff() staff: StaffMember, @Input() input: Parsed<"crmOrder">): Promise<Output<"crmOrder">> {
    return this.lists.orderDetail(staff, input.orderId);
  }
}
