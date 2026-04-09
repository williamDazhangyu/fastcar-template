"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const annotation_1 = require("@fastcar/core/annotation");
let Data = class Data {
    accounts;
    permissions;
    redirect; //重定向配置，支持域名嵌套或全局路径
    defaultredirect; //全局的重定向
    domains; //域名列表
};
Data = __decorate([
    annotation_1.Hotter,
    (0, annotation_1.Configure)("data.yml")
], Data);
exports.default = Data;
