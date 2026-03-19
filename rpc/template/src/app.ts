import "reflect-metadata";
import { Application } from "@fastcar/core/annotation";
import { EnableRPC } from "@fastcar/rpc/annotation";

@Application
@EnableRPC
class APP {}
export default new APP();
