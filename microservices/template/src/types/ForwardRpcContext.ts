import { RpcContext, ClientSession } from "@fastcar/rpc";

export type ForwardRpcContext = { session: ClientSession; forward: boolean } & RpcContext;
