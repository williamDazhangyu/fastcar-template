"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@fastcar/core");
const annotation_1 = require("@fastcar/core/annotation");
const utils_1 = require("@fastcar/core/utils");
const nanoid_1 = require("nanoid");
const fs = require("fs");
const path = require("path");
const yaml = require("yaml");
let CosService = class CosService {
    app;
    logger;
    getTaskLength(f, total) {
        let count = 0;
        for (let i = 0; i < total; i++) {
            let chunkPath = `${f}.${i + 1}`;
            if (fs.existsSync(chunkPath)) {
                count++;
            }
        }
        return count;
    }
    getData() {
        let datafp = path.join(this.app.getResourcePath(), "data.yml");
        if (fs.existsSync(datafp)) {
            return Object.assign({
                accounts: [],
                permissions: {},
                redirect: {},
            }, utils_1.FileUtil.getResource(datafp));
        }
        let d = {
            accounts: [],
            permissions: {},
            redirect: {},
        };
        this.writeData(d);
        return d;
    }
    writeData(d) {
        let datafp = path.join(this.app.getResourcePath(), "data.yml");
        fs.writeFileSync(datafp, yaml.stringify(d));
    }
    createAccount() {
        return {
            appid: (0, nanoid_1.nanoid)(),
            serectkey: utils_1.CryptoUtil.getHashStr(16),
        };
    }
    getFilePath(f) {
        let dp = this.app.getSetting("dir_path");
        if (!dp) {
            dp = path.join(this.app.getResourcePath(), "../", "data");
        }
        return f ? path.join(dp, f) : dp;
    }
    deleteFiles(filename, total) {
        for (let i = 0; i < total; i++) {
            let chunkPath = `${filename}.${i + 1}`;
            if (fs.existsSync(chunkPath)) {
                fs.rm(chunkPath, {
                    recursive: true,
                    force: true,
                }, () => { });
            }
        }
    }
    sleep(timer) {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve("");
            }, timer);
        });
    }
    async mergeFile(filename, total) {
        return new Promise(async (resolve) => {
            let writeStream = fs.createWriteStream(filename);
            writeStream.on("error", (err) => {
                this.logger.error(`合并的写入流错误:`, err);
                writeStream.destroy();
                resolve(false);
            });
            writeStream.on("finish", () => {
                writeStream.destroy();
                resolve(true);
            });
            for (let i = 0; i < total; i++) {
                let chunkPath = `${filename}.${i + 1}`;
                if (!fs.existsSync(chunkPath)) {
                    //等待100ms
                    await this.sleep(100);
                }
                let readStream = fs.createReadStream(chunkPath);
                let res = await new Promise((resolve1) => {
                    readStream.on("error", (err) => {
                        this.logger.error(`合并的读取流错误:`, err);
                        readStream.destroy();
                        resolve1(false);
                    });
                    readStream.pipe(writeStream, { end: false });
                    readStream.on("end", () => {
                        readStream.destroy();
                        resolve1(true);
                    });
                });
                if (!res) {
                    writeStream.destroy();
                    resolve(false);
                    break;
                }
            }
            writeStream.end();
        });
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", core_1.FastCarApplication)
], CosService.prototype, "app", void 0);
__decorate([
    (0, annotation_1.Log)(),
    __metadata("design:type", core_1.Logger)
], CosService.prototype, "logger", void 0);
CosService = __decorate([
    annotation_1.Service
], CosService);
exports.default = CosService;
