import { ClientSession } from "@fastcar/rpc";

export type ClientSimpleSession = Omit<ClientSession, "serverId">;
