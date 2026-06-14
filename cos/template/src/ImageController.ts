import { Autowired, Controller, Log, Rule, ValidForm, Value } from "@fastcar/core/annotation";
import { Logger } from "@fastcar/core";
import { POST } from "@fastcar/koa/annotation";
import Result from "./model/Result";
import { CODE } from "./model/Code";
import ImageService from "./ImageService";

enum ImageErrorMessage {
	imageProcessFailed = "IMAGE_PROCESS_FAILED",
	previewSourceNotFound = "PREVIEW_SOURCE_NOT_FOUND",
	previewSourceNotImage = "PREVIEW_SOURCE_NOT_IMAGE",
	previewSourceUrlUnsupported = "PREVIEW_SOURCE_URL_UNSUPPORTED",
	imageResizeUnsupportedFormat = "IMAGE_RESIZE_UNSUPPORTED_FORMAT",
	imageTargetExists = "IMAGE_TARGET_EXISTS",
	previewSourceHttpPrefix = "PREVIEW_SOURCE_HTTP_",
	imageSourceInvalid = "IMAGE_SOURCE_INVALID",
	imageTargetFilenameRequired = "IMAGE_TARGET_FILENAME_REQUIRED",
	imageTargetEqualsSource = "IMAGE_TARGET_EQUALS_SOURCE",
	imageResizeDimensionsRequired = "IMAGE_RESIZE_DIMENSIONS_REQUIRED",
	imageDimensionTooLarge = "IMAGE_DIMENSION_TOO_LARGE",
	previewSourceTooLarge = "PREVIEW_SOURCE_TOO_LARGE",
	previewSourceDecodeFailed = "PREVIEW_SOURCE_DECODE_FAILED",
	previewSourceTimeout = "PREVIEW_SOURCE_TIMEOUT",
	previewSourceFetchFailed = "PREVIEW_SOURCE_FETCH_FAILED",
	previewSourceUrlInvalid = "PREVIEW_SOURCE_URL_INVALID",
	previewDimensionsMissing = "PREVIEW_DIMENSIONS_MISSING",
	previewFilenameInvalid = "PREVIEW_FILENAME_INVALID",
	previewSourceEmpty = "PREVIEW_SOURCE_EMPTY",
}

@Controller
export default class ImageController {
	@Autowired
	private imageService!: ImageService;

	@Value("sys.domain")
	private domain!: string;

	@Log()
	private logger!: Logger;

	@POST("/image/generatePreview")
	@ValidForm
	async generatePreview(
		@Rule({
			filename: { required: false },
			sourceUrl: { required: false },
			targetFilename: { required: true },
			maxLongEdge: { required: false, type: "int" },
			maxOriginalBytes: { required: false, type: "int" },
			localImageMaxBytes: { required: false, type: "int" },
			externalImageMaxBytes: { required: false, type: "int" },
			externalImageTimeoutMs: { required: false, type: "int" },
			webpQuality: { required: false, type: "int" },
			maxDimension: { required: false, type: "int" },
		})
		body: {
			filename?: string;
			sourceUrl?: string;
			targetFilename: string;
			maxLongEdge?: number;
			maxOriginalBytes?: number;
			localImageMaxBytes?: number;
			externalImageMaxBytes?: number;
			externalImageTimeoutMs?: number;
			webpQuality?: number;
			maxDimension?: number;
		}
	) {
		try {
			return Result.ok(await this.imageService.generatePreview(body, this.domain));
		} catch (error) {
			return this.toImageErrorResult("Generate preview failed", error);
		}
	}

	@POST("/image/resize")
	@ValidForm
	async resize(
		@Rule({
			filename: { required: false },
			sourceUrl: { required: false },
			targetFilename: { required: true },
			width: { required: false, type: "int" },
			height: { required: false, type: "int" },
			localImageMaxBytes: { required: false, type: "int" },
			externalImageMaxBytes: { required: false, type: "int" },
			externalImageTimeoutMs: { required: false, type: "int" },
			webpQuality: { required: false, type: "int" },
			maxDimension: { required: false, type: "int" },
		})
		body: {
			filename?: string;
			sourceUrl?: string;
			targetFilename: string;
			width?: number;
			height?: number;
			localImageMaxBytes?: number;
			externalImageMaxBytes?: number;
			externalImageTimeoutMs?: number;
			webpQuality?: number;
			maxDimension?: number;
		}
	) {
		try {
			return Result.ok(await this.imageService.resizeImage(body, this.domain));
		} catch (error) {
			return this.toImageErrorResult("Resize image failed", error);
		}
	}

	private toImageErrorResult(logMessage: string, error: unknown) {
		const message = error instanceof Error ? error.message : ImageErrorMessage.imageProcessFailed;
		if (message == ImageErrorMessage.previewSourceNotFound) {
			return Result.errorCode(CODE.NOT_FOUND, message);
		}
		if (message == ImageErrorMessage.previewSourceNotImage || message == ImageErrorMessage.previewSourceUrlUnsupported || message == ImageErrorMessage.imageResizeUnsupportedFormat) {
			return Result.errorCode(CODE.NOT_SUPPORT, message);
		}
		if (message == ImageErrorMessage.imageTargetExists) {
			return Result.errorCode(CODE.FILE_EXIST, message);
		}
		if (
			message.startsWith(ImageErrorMessage.previewSourceHttpPrefix) ||
			message == ImageErrorMessage.imageSourceInvalid ||
			message == ImageErrorMessage.imageTargetFilenameRequired ||
			message == ImageErrorMessage.imageTargetEqualsSource ||
			message == ImageErrorMessage.imageResizeDimensionsRequired ||
			message == ImageErrorMessage.imageDimensionTooLarge ||
			message == ImageErrorMessage.previewSourceTooLarge ||
			message == ImageErrorMessage.previewSourceDecodeFailed ||
			message == ImageErrorMessage.previewSourceTimeout ||
			message == ImageErrorMessage.previewSourceFetchFailed ||
			message == ImageErrorMessage.previewSourceUrlInvalid ||
			message == ImageErrorMessage.previewDimensionsMissing ||
			message == ImageErrorMessage.previewFilenameInvalid ||
			message == ImageErrorMessage.previewSourceEmpty
		) {
			return Result.errorCode(CODE.BAD_REQUEST, message);
		}

		this.logger.error(logMessage, error);
		return Result.errorCode(CODE.FAIL, message);
	}
}
