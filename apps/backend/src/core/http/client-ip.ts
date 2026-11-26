import type { FastifyRequest } from "fastify";
import { clientIpFrom } from "@/shared/clientIp";
import { header } from "./request";

/** Адрес клиента — по общему правилу (подпись фронта, X-Real-IP, последний X-Forwarded-For). */
export const clientIp = (req: FastifyRequest, edgeIpSecret: string | undefined) => clientIpFrom((name) => header(req, name), edgeIpSecret);
