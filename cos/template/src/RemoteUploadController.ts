import { Autowired, Controller, Log, Rule, ValidForm } from "@fastcar/core/annotation";
import { Logger } from "@fastcar/core";
import { GET, POST } from "@fastcar/koa/annotation";
import { Context } from "koa";
import Result from "./model/Result";
import { CODE } from "./model/Code";
import { RemoteUploadAuthClaims, RemoteUploadError, RemoteUploadErrorCode } from "./model/RemoteUpload";
import RemoteUploadService from "./RemoteUploadService";

@Controller
export default class RemoteUploadController {
	@Autowired
	private remoteUploadService!: RemoteUploadService;

	@Log()
	private logger!: Logger;

	@POST("/uploadByUrl")
	@ValidForm
	uploadByUrl(
		@Rule({
			url: { required: true },
			targetFilename: { required: true },
		})
		{ url, targetFilename }: { url: string; targetFilename: string },
		ctx: Context
	) {
		try {
			return Result.ok(this.remoteUploadService.create(url, targetFilename, this.authClaims(ctx)));
		} catch (error) {
			return this.toErrorResult(ctx, error);
		}
	}

	@GET("/uploadByUrl/progress")
	@ValidForm
	progress(
		@Rule({
			targetFilename: { required: true },
		})
		{ targetFilename }: { targetFilename: string },
		ctx: Context
	) {
		try {
			return Result.ok(this.remoteUploadService.getProgress(targetFilename, this.authClaims(ctx)));
		} catch (error) {
			return this.toErrorResult(ctx, error);
		}
	}

	private authClaims(ctx: Context): RemoteUploadAuthClaims {
		return (ctx.state as { authClaims?: RemoteUploadAuthClaims }).authClaims as RemoteUploadAuthClaims;
	}

	private toErrorResult(ctx: Context, error: unknown) {
		if (error instanceof RemoteUploadError) {
			ctx.status = error.httpCode;
			return Result.errorCode(error.httpCode, error.errorCode);
		}
		this.logger.error("Remote upload request failed", error);
		ctx.status = CODE.FAIL;
		return Result.errorCode(CODE.FAIL, RemoteUploadErrorCode.storageError);
	}
}
