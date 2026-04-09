"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const annotation_1 = require("@fastcar/core/annotation");
const annotation_2 = require("@fastcar/koa/annotation");
const koa_1 = require("@fastcar/koa");
const LimitMiddleware_1 = require("./middleware/LimitMiddleware");
const GetFileMiddleware_1 = require("./middleware/GetFileMiddleware");
const AuthMiddleware_1 = require("./middleware/AuthMiddleware");
let APP = class APP {
};
APP = __decorate([
    annotation_2.EnableKoa,
    annotation_1.Application,
    (0, annotation_2.KoaMiddleware)(GetFileMiddleware_1.default, koa_1.ExceptionGlobalHandler, LimitMiddleware_1.default, koa_1.KoaBody, koa_1.KoaBodyParser, koa_1.KoaCors, AuthMiddleware_1.default)
], APP);
exports.default = new APP();
