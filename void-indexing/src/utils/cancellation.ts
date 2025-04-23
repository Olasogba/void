/**
 * A token used to cancel operations.
 */
export interface CancellationToken {
	/**
	 * A flag signalling is cancellation has been requested.
	 */
	readonly isCancellationRequested: boolean;
}

/**
 * Standard predefined cancellation tokens.
 */
export namespace CancellationToken {
	/**
	 * A token that is never cancelled.
	 */
	export const None: CancellationToken = Object.freeze<CancellationToken>({
		isCancellationRequested: false
	});

	/**
	 * A token that is already cancelled.
	 */
	export const Cancelled: CancellationToken = Object.freeze<CancellationToken>({
		isCancellationRequested: true
	});
}

/**
 * A source that can create CancellationTokens and trigger them.
 */
export class CancellationTokenSource {
	private _token?: CancellationToken = undefined;

	/**
	 * Get the token for this source
	 */
	get token(): CancellationToken {
		if (!this._token) {
			this._token = new MutableToken();
		}
		return this._token;
	}

	/**
	 * Cancel the token
	 */
	cancel(): void {
		if (!this._token) {
			this._token = CancellationToken.Cancelled;
		} else if (this._token instanceof MutableToken) {
			this._token.cancel();
		}
	}

	/**
	 * Dispose the token source
	 */
	dispose(): void {
		if (this._token instanceof MutableToken) {
			this._token.dispose();
		}
		this._token = CancellationToken.None;
	}
}

/**
 * A mutable token that can be cancelled
 */
class MutableToken implements CancellationToken {
	private _isCancelled: boolean = false;

	/**
	 * Cancel this token
	 */
	public cancel() {
		if (!this._isCancelled) {
			this._isCancelled = true;
		}
	}

	/**
	 * Check if cancellation is requested
	 */
	get isCancellationRequested(): boolean {
		return this._isCancelled;
	}

	/**
	 * Dispose the token
	 */
	public dispose(): void {
		// Nothing to do
	}
}
