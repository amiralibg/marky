import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from "react";
import { safeSandbox } from "../../utils/htmlFrameMessages";

/**
 * One sandboxed iframe showing a document's `srcdoc`.
 *
 * Messages are accepted only from this frame's own window and only when they
 * carry the frame's channel; what they say is still validated by the caller.
 * The frame is remounted (via `key` in the caller) whenever its sandbox
 * changes, because a changed `sandbox` attribute only applies to the next
 * navigation, and the `sandbox` attribute is set before `srcdoc` so the very
 * first load is already sandboxed.
 */
const HtmlFrame = forwardRef(({ srcDoc, sandbox, channel, title, onMessage, ...rest }, ref) => {
  const frameRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useImperativeHandle(
    ref,
    () => ({
      post: (message) => {
        const target = frameRef.current?.contentWindow;
        // The frame's origin is opaque, so "*" is the only target that
        // reaches it; the frame checks the channel and that the sender is
        // its parent.
        if (target) target.postMessage({ ...message, channel }, "*");
      },
      element: () => frameRef.current,
    }),
    [channel]
  );

  useEffect(() => {
    const handler = (event) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== "object" || Array.isArray(data)) return;
      if (data.channel !== channel || typeof data.type !== "string") return;
      onMessageRef.current?.(data);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [channel]);

  return (
    <iframe
      ref={frameRef}
      sandbox={safeSandbox(sandbox)}
      srcDoc={srcDoc}
      title={title}
      referrerPolicy="no-referrer"
      allow=""
      // `className` and `onLoad` (the view's loading overlay). Never a
      // sandbox: that is fixed above, before srcdoc.
      className={rest.className}
      onLoad={rest.onLoad}
    />
  );
});

HtmlFrame.displayName = "HtmlFrame";

export default memo(HtmlFrame);
