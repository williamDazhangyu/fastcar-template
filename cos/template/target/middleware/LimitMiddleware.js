"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LimitMiddleware;
const Result_1 = require("../model/Result");
const core_1 = require("@fastcar/core");
const Code_1 = require("../model/Code");
const timer_1 = require("@fastcar/timer");
const clientIPMap = new core_1.DataMap();
let heartbeat = new timer_1.Heartbeat({
    fixedRate: 100,
});
setTimeout(() => {
    let app = Reflect.get(global, core_1.CommonConstant.FastcarApp);
    let limit = app.getSetting("limit");
    if (!!limit) {
        let timer = limit.frequency * timer_1.TimeUnitNum.second;
        heartbeat.start((diff) => {
            timer -= diff;
            if (timer <= 0) {
                clientIPMap.clear();
                timer = limit.frequency * timer_1.TimeUnitNum.second;
            }
        }, this);
    }
}, timer_1.TimeUnitNum.second * 30);
function LimitMiddleware(app) {
    return async (ctx, next) => {
        let limit = app.getSetting("limit");
        if (limit) {
            let ip = ctx.remoteAddress;
            let limitItem = clientIPMap.get(ip) || 0;
            if (limitItem > limit.count) {
                ctx.body = Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST);
                ctx.status = 400;
                return;
            }
            clientIPMap.set(ip, ++limitItem);
        }
        await next();
    };
}
