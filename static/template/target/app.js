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
let APP = class APP {
    app;
};
APP = __decorate([
    annotation_1.Application,
    annotation_2.EnableKoa,
    (0, annotation_2.KoaMiddleware)(koa_1.ExceptionGlobalHandler),
    (0, annotation_2.KoaMiddleware)(koa_1.KoaStatic)
], APP);
exports.default = new APP();
