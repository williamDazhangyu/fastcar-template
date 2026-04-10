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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const annotation_1 = require("@fastcar/core/annotation");
const annotation_2 = require("@fastcar/koa/annotation");
const Result_1 = require("./model/Result");
const nanoid_1 = require("nanoid");
const core_1 = require("@fastcar/core");
const fs = require("fs");
const path = require("path");
const util_1 = require("./utils/util");
const Code_1 = require("./model/Code");
const MimeMap_1 = require("./model/MimeMap");
const CosService_1 = require("./CosService");
const Data_1 = require("./model/Data");
const compressing = require("compressing");
const ZipMap_1 = require("./model/ZipMap");
const crypto = require("crypto");
const CompressZip = [".gz", ".br"];
const CompressSuffix = ["gzip", "br"];
let CosController = class CosController {
    cosService;
    domain;
    logger;
    data;
    getAccountInfo() {
        return Result_1.default.ok(this.cosService.createAccount());
    }
    checkSign() {
        return Result_1.default.ok();
    }
    createSign(info) {
        let serectkey = Reflect.get(info, "serectkey");
        Reflect.deleteProperty(info, serectkey);
        let encMsg = "";
        try {
            let pwd = Buffer.from(serectkey);
            let iv = crypto.randomBytes(12);
            let cipher = crypto.createCipheriv("aes-256-gcm", pwd, iv);
            //加密
            let enc = cipher.update(JSON.stringify(info), "utf8", "base64");
            enc += cipher.final("base64");
            let tags = cipher.getAuthTag();
            let encStr = Buffer.from(enc, "base64");
            //由于和java对应的AES/GCM/PKCS5Padding模式对应 所以采用这个拼接
            let totalLength = iv.length + encStr.length + tags.length;
            let bufferMsg = Buffer.concat([iv, encStr, tags], totalLength);
            encMsg = encodeURIComponent(`${info.appid};${bufferMsg.toString("base64")}`);
        }
        catch (e) {
            this.logger.error("Encrypt is error", e);
        }
        return Result_1.default.ok(encMsg);
    }
    getFile({ filename }, ctx) {
        return this.handleGetFile(filename, ctx, false);
    }
    // 添加 HEAD 方法支持
    headFile({ filename }, ctx) {
        return this.handleGetFile(filename, ctx, true);
    }
    // 处理文件请求的核心逻辑
    handleGetFile(filename, ctx, isHead) {
        let range = ctx.headers["range"];
        let positions = {
            start: 0,
            end: 0,
        };
        let ETag = "";
        let modifyTime = "Last-Modified";
        let fp = this.cosService.getFilePath(filename);
        if (fs.existsSync(fp)) {
            let stats = fs.statSync(fp);
            if (!stats.isFile()) {
                // ctx.status = CODE.BAD_REQUEST;
                // return Result.errorCode(ctx.status);
                //修改为404方便重定向
                ctx.status = Code_1.CODE.NOT_FOUND;
                return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND);
            }
            ctx.set({
                "Content-Length": stats.size.toString(),
            });
            if (range) {
                let [start, end] = range.replace(/bytes=/, "").split("-");
                positions = {
                    start: parseInt(start, 10),
                    end: end ? parseInt(end, 10) : stats.size - 1,
                };
                if (!isNaN(positions.start) && !isNaN(positions.end)) {
                    ctx.set({
                        "Content-Range": `bytes ${positions.start}-${positions.end}/${stats.size}`,
                        "Content-Length": (positions.end - positions.start + 1).toString(),
                    });
                }
            }
            ETag = stats.mtime.getTime().toString();
            modifyTime = stats.mtime.toUTCString();
        }
        else {
            ctx.status = Code_1.CODE.NOT_FOUND;
            return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND);
        }
        // let disposition = fp.split(path.sep).pop();
        ctx.set({
            "Content-Type": (0, MimeMap_1.default)(filename) || "application/json",
            "Accept-Ranges": "bytes",
            ETag: ETag,
            "Last-Modified": modifyTime,
            // "Content-Disposition": `attachment; filename="${disposition}"`,
        });
        CompressZip.some((suffix, index) => {
            if (filename.endsWith(suffix)) {
                let gzindex = filename.indexOf(suffix);
                ctx.set("Content-Encoding", CompressSuffix[index]);
                ctx.set("Content-Type", (0, MimeMap_1.default)(filename.substring(0, gzindex)) || "application/json");
                return true;
            }
            return false;
        });
        // HEAD 请求只返回响应头，不返回响应体
        if (isHead) {
            ctx.status = 200;
            ctx.body = "";
            return;
        }
        if (!range) {
            ctx.status = 200;
            ctx.body = fs.createReadStream(fp); // 发送文件流
        }
        else {
            ctx.status = 206;
            ctx.body = fs.createReadStream(fp, positions); // 发送文件流
        }
    }
    async uploadfile({ chunkNumber, totalChunks }, ctx) {
        if (!Reflect.has(ctx.request, "files")) {
            return Result_1.default.errorMsg("请选择内容上传");
        }
        let files = Reflect.get(ctx.request, "files");
        let rootPath = this.cosService.getFilePath();
        let keys = Object.keys(files);
        if (keys.length == 0) {
            return Result_1.default.errorMsg("请选择内容上传");
        }
        //现在只取单一的一个元素
        let dir = keys[0];
        let fileValue = files[dir];
        let originalFilename = fileValue.originalFilename;
        //重命名文件
        if (totalChunks > 1) {
            originalFilename = `${originalFilename}.${chunkNumber}`;
        }
        if (!originalFilename) {
            originalFilename = (0, nanoid_1.nanoid)();
        }
        if (!originalFilename.startsWith("/")) {
            originalFilename = `/${originalFilename}`;
        }
        let wp = path.join(rootPath, dir, originalFilename);
        let dirIndex = wp.lastIndexOf(path.sep);
        let dirpath = wp.substring(0, dirIndex);
        let flag = (0, util_1.createDirPath)(dirpath);
        if (!flag) {
            return Result_1.default.errorCode(Code_1.CODE.FILE_EXIST);
        }
        let realfpIndex = wp.lastIndexOf(".");
        let realfilename = wp.substring(0, realfpIndex);
        return new Promise((resolve) => {
            const reader = fs.createReadStream(fileValue.filepath); // 创建可读流
            const writer = fs.createWriteStream(wp); // 创建可写流
            reader.pipe(writer);
            writer.on("finish", async () => {
                reader.destroy();
                writer.destroy();
                let rp = `${dir || ""}${originalFilename}`;
                if (!rp.startsWith("/")) {
                    rp = `/${rp}`;
                }
                if (totalChunks > 1 && totalChunks == this.cosService.getTaskLength(realfilename, totalChunks)) {
                    rp = rp.substring(0, rp.lastIndexOf("."));
                    let flag = await this.cosService.mergeFile(realfilename, totalChunks);
                    this.cosService.deleteFiles(realfilename, totalChunks);
                    if (!flag) {
                        if (fs.existsSync(realfilename)) {
                            fs.rm(realfilename, {
                                recursive: true,
                                force: true,
                            }, () => { });
                        }
                    }
                    resolve(flag ? Result_1.default.ok(`${this.domain}${rp}`) : Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST));
                }
                else {
                    resolve(Result_1.default.ok(`${this.domain}${rp}`));
                }
            });
            reader.on("error", (err) => {
                this.logger.error(`读取流出错${fileValue.filepath}:${err.message}`);
                reader.destroy();
                writer.destroy();
                resolve(Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST));
            });
            writer.on("error", (err) => {
                this.logger.error(`写入流出错${wp}:${err.message}`);
                reader.destroy();
                writer.destroy();
                resolve(Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST));
            });
        });
    }
    deleteChunkFile({ filename, totalChunks }) {
        //删除分块文件
        let fp = this.cosService.getFilePath(filename);
        let baseDir = path.dirname(fp);
        let baseName = path.basename(filename);
        let deleteChunks = 0;
        for (let i = 1; i <= totalChunks; i++) {
            let chunkPath = path.join(baseDir, `${baseName}.${i}`);
            if (fs.existsSync(chunkPath)) {
                fs.rmSync(chunkPath, { force: true });
                deleteChunks++;
            }
        }
        return Result_1.default.ok();
    }
    deleteFile({ filename }) {
        //删除文件
        let fp = this.cosService.getFilePath(filename);
        if (fs.existsSync(fp)) {
            fs.rmSync(fp, { recursive: true, force: true });
        }
        return Result_1.default.ok();
    }
    async extractFile({ filename, targetDir }) {
        let fp = this.cosService.getFilePath(filename);
        if (!fs.existsSync(fp)) {
            return Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST);
        }
        let stats = fs.statSync(fp);
        if (!stats.isFile()) {
            return Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST);
        }
        let baseDir = path.dirname(fp);
        //获取后缀名
        let suffix = "";
        ZipMap_1.ZipSuffixs.some((item) => {
            if (fp.endsWith(item)) {
                suffix = item;
                return true;
            }
            return false;
        });
        let fn = ZipMap_1.ZipMap.get(suffix);
        if (!fn) {
            return Result_1.default.errorCode(Code_1.CODE.NOT_SUPPORT, "method does not support");
        }
        //处理文件名称
        if (!targetDir) {
            //直接创建一个文件夹并放置下面
            let index = fp.lastIndexOf(suffix);
            if (index != -1) {
                baseDir = fp.substring(0, index);
            }
        }
        else {
            baseDir = this.cosService.getFilePath(targetDir);
        }
        let cfn = Reflect.get(compressing, fn);
        if (!cfn) {
            return Result_1.default.errorCode(Code_1.CODE.NOT_SUPPORT, "method does not support");
        }
        return new Promise((resolve) => {
            cfn.uncompress(fp, baseDir)
                .then(() => {
                resolve(Result_1.default.ok());
            })
                .catch((e) => {
                this.logger.error(`${filename} unzip error`, e);
                resolve(Result_1.default.errorMsg(`Extraction failed: ${e.message}`));
            });
        });
    }
    //可访问桶
    queryFilelist({ filename }, ctx) {
        let rootPath = this.cosService.getFilePath(filename);
        if (!fs.existsSync(rootPath)) {
            ctx.status = Code_1.CODE.NOT_FOUND;
            return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND);
        }
        let resultFiles = [];
        let rootInfo = fs.statSync(rootPath);
        if (rootInfo.isFile()) {
            resultFiles.push({
                name: rootPath.split(path.sep).pop() || "/",
                create_time: rootInfo.ctime.getTime(),
                modify_time: rootInfo.mtime.getTime(),
                size: rootInfo.size,
                file: true,
            });
        }
        else {
            const files = fs.readdirSync(rootPath);
            files.forEach((tp) => {
                let t = fs.statSync(path.join(rootPath, tp));
                resultFiles.push({
                    name: tp,
                    create_time: t.ctime.getTime(),
                    modify_time: t.mtime.getTime(),
                    size: t.size,
                    file: t.isFile(),
                });
            });
        }
        return Result_1.default.ok(resultFiles);
    }
    //创建文件夹
    createDir({ dirname, permission }, ctx) {
        let dirpath = this.cosService.getFilePath(dirname);
        if (fs.existsSync(dirpath)) {
            return Result_1.default.ok();
        }
        if ((0, util_1.createDirPath)(dirpath)) {
            if (permission) {
                this.setPermissions({
                    filename: dirname,
                    permission,
                }, ctx);
            }
            return Result_1.default.ok();
        }
        return Result_1.default.errorCode(Code_1.CODE.FAIL);
    }
    //初始化添加用户
    initAccount({}, ctx) {
        let data = this.cosService.getData();
        if (data.accounts.length != 0) {
            return Result_1.default.errorCode(Code_1.CODE.FORBID, `Account has been initialized`);
        }
        return this.addAccount({}, ctx);
    }
    getAccountList() {
        return Result_1.default.ok(this.data.accounts.map((item) => {
            return item.appid;
        }));
    }
    //添加用户
    addAccount({}, ctx) {
        let data = this.cosService.getData();
        let info = this.cosService.createAccount();
        data.accounts.push(info);
        this.cosService.writeData(data);
        return Result_1.default.ok(info);
    }
    //删除用户
    delAccount({ account }) {
        let data = this.cosService.getData();
        let findIndex = data.accounts.findIndex((item) => {
            return item.appid == account;
        });
        if (findIndex > -1) {
            data.accounts.splice(findIndex, 1);
            this.cosService.writeData(data);
        }
        return Result_1.default.ok();
    }
    //设置桶权限
    setPermissions({ filename, permission }, ctx) {
        let fp = this.cosService.getFilePath(filename);
        if (!fs.existsSync(fp)) {
            return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND);
        }
        let data = this.cosService.getData();
        data.permissions[filename] = permission;
        this.cosService.writeData(data);
        return Result_1.default.ok();
    }
    //获取当前的文件的权限 返回权限 是否为继承/指定
    getPermissions({ filename }) {
        let f = filename;
        if (!f.startsWith("/")) {
            f = `/${f}`;
        }
        let permission = (0, util_1.matchPermissions)(this.data.permissions, f);
        return Result_1.default.ok({
            filename,
            permission,
            source: Reflect.has(this.data.permissions, filename) ? "set" : "extend", //设定/继承
        });
    }
    //移除文件的权限
    delPermissions({ filename }) {
        let data = this.cosService.getData();
        if (Reflect.has(this.data.permissions, filename)) {
            Reflect.deleteProperty(data.permissions, filename);
            this.cosService.writeData(data);
        }
        return Result_1.default.ok();
    }
    //设置重定向
    setRedirect({ redirectUrl, flag, bucket, domain }) {
        let data = this.cosService.getData();
        if (!redirectUrl.startsWith("/") && !redirectUrl.startsWith("http")) {
            redirectUrl = `/${redirectUrl}`;
        }
        //全部重定向
        if (flag) {
            data.defaultredirect = redirectUrl;
        }
        else {
            if (!bucket) {
                return Result_1.default.errorCode(Code_1.CODE.BAD_REQUEST);
            }
            if (!bucket.startsWith("/")) {
                bucket = `/${bucket}`;
            }
            // 如果指定了域名，设置域名级别的重定向
            if (domain) {
                if (!data.redirect[domain]) {
                    data.redirect[domain] = {};
                }
                data.redirect[domain][bucket] = redirectUrl;
            }
            else {
                // 全局路径重定向
                data.redirect[bucket] = redirectUrl;
            }
        }
        this.cosService.writeData(data);
        return Result_1.default.ok();
    }
    rename({ filename, newname }) {
        //删除文件
        let fp = this.cosService.getFilePath(filename);
        let np = this.cosService.getFilePath(newname);
        if (fs.existsSync(fp)) {
            fs.renameSync(fp, np);
        }
        else {
            return Result_1.default.errorCode(Code_1.CODE.NOT_FOUND);
        }
        return Result_1.default.ok();
    }
    getRedirect() {
        let data = this.cosService.getData();
        return Result_1.default.ok({
            redirect: data.redirect,
            defaultredirect: data.defaultredirect || "",
        });
    }
    queryRedirect({ bucketUrl, domain }) {
        let data = this.cosService.getData();
        if (!bucketUrl) {
            return Result_1.default.ok("/");
        }
        if (!bucketUrl.startsWith("/")) {
            bucketUrl = `/${bucketUrl}`;
        }
        let redirectUrl;
        // 如果指定了域名，优先查询域名下的配置
        if (domain) {
            const domainConfig = data.redirect?.[domain];
            if (typeof domainConfig === "object") {
                redirectUrl = domainConfig[bucketUrl];
            }
        }
        // 如果没找到，查询全局配置
        if (!redirectUrl) {
            const globalConfig = data.redirect?.[bucketUrl];
            if (typeof globalConfig === "string") {
                redirectUrl = globalConfig;
            }
        }
        return Result_1.default.ok(redirectUrl || "");
    }
    // 获取域名列表
    getDomains() {
        let data = this.cosService.getData();
        return Result_1.default.ok(data.domains || []);
    }
    // 保存域名列表
    saveDomains({ domains }) {
        let data = this.cosService.getData();
        data.domains = domains;
        this.cosService.writeData(data);
        return Result_1.default.ok();
    }
    // 删除重定向配置
    delRedirect({ bucket, domain }) {
        let data = this.cosService.getData();
        if (!bucket.startsWith("/")) {
            bucket = `/${bucket}`;
        }
        // 如果指定了域名，删除域名级别的重定向
        if (domain) {
            const domainConfig = data.redirect?.[domain];
            if (typeof domainConfig === "object" && domainConfig[bucket]) {
                delete data.redirect[domain][bucket];
                // 如果该域名下没有配置了，删除整个域名对象
                if (Object.keys(data.redirect[domain]).length === 0) {
                    delete data.redirect[domain];
                }
            }
        }
        else {
            // 删除全局路径重定向
            if (typeof data.redirect?.[bucket] === "string") {
                delete data.redirect[bucket];
            }
        }
        this.cosService.writeData(data);
        return Result_1.default.ok();
    }
};
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", CosService_1.default)
], CosController.prototype, "cosService", void 0);
__decorate([
    (0, annotation_1.Value)("sys.domain"),
    __metadata("design:type", String)
], CosController.prototype, "domain", void 0);
__decorate([
    (0, annotation_1.Log)(),
    __metadata("design:type", core_1.Logger)
], CosController.prototype, "logger", void 0);
__decorate([
    annotation_1.Autowired,
    __metadata("design:type", Data_1.default)
], CosController.prototype, "data", void 0);
__decorate([
    (0, annotation_2.GET)("/common/getAccountInfo"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getAccountInfo", null);
__decorate([
    (0, annotation_2.GET)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CosController.prototype, "checkSign", null);
__decorate([
    (0, annotation_2.POST)("/common/createSign"),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        appid: { required: true },
        expireTime: { required: true, type: "int" },
        dir_path: { required: true },
        mode: { required: true, type: "int" },
        serectkey: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "createSign", null);
__decorate([
    (0, annotation_2.GET)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getFile", null);
__decorate([
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "headFile", null);
__decorate([
    (0, annotation_2.POST)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        chunkNumber: { type: "int", defaultVal: 1 },
        totalChunks: { type: "int", defaultVal: 1 },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], CosController.prototype, "uploadfile", null);
__decorate([
    (0, annotation_2.DELETE)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
        totalChunks: { type: "int", defaultVal: 1 },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "deleteChunkFile", null);
__decorate([
    (0, annotation_2.DELETE)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "deleteFile", null);
__decorate([
    (0, annotation_2.POST)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
        targetDir: { required: false },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], CosController.prototype, "extractFile", null);
__decorate([
    (0, annotation_2.GET)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "queryFilelist", null);
__decorate([
    (0, annotation_2.POST)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        dirname: { required: true },
        permission: {
            filters: [
                {
                    fn: (str) => {
                        return ["public", "private"].includes(str);
                    },
                },
            ],
        },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "createDir", null);
__decorate([
    (0, annotation_2.POST)("/common/initAccount"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "initAccount", null);
__decorate([
    (0, annotation_2.GET)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getAccountList", null);
__decorate([
    (0, annotation_2.POST)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "addAccount", null);
__decorate([
    (0, annotation_2.DELETE)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        account: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "delAccount", null);
__decorate([
    (0, annotation_2.PUT)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "setPermissions", null);
__decorate([
    (0, annotation_2.GET)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getPermissions", null);
__decorate([
    (0, annotation_2.DELETE)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "delPermissions", null);
__decorate([
    (0, annotation_2.POST)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        redirectUrl: { required: true },
        flag: { required: true, type: "boolean" },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "setRedirect", null);
__decorate([
    (0, annotation_2.PUT)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        filename: { required: true },
        newname: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "rename", null);
__decorate([
    (0, annotation_2.GET)(),
    annotation_1.ValidForm,
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getRedirect", null);
__decorate([
    (0, annotation_2.GET)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "queryRedirect", null);
__decorate([
    (0, annotation_2.GET)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CosController.prototype, "getDomains", null);
__decorate([
    (0, annotation_2.POST)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        domains: { required: true, type: "array" },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "saveDomains", null);
__decorate([
    (0, annotation_2.DELETE)(),
    annotation_1.ValidForm,
    __param(0, (0, annotation_1.Rule)({
        bucket: { required: true },
    })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CosController.prototype, "delRedirect", null);
CosController = __decorate([
    annotation_1.Controller
], CosController);
exports.default = CosController;
// 注册 HEAD 路由
(0, annotation_2.AddMapping)(CosController.prototype, {
    url: "/getFile",
    method: "headFile",
    request: ["head"],
});
