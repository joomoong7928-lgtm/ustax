package com.ustax.calc;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions;

/**
 * 기기 안에서(오프라인) ML Kit 한국어 OCR로 캡처 이미지를 읽어 줄 단위 텍스트와 위치를 돌려준다.
 * 이미지는 기기 밖으로 나가지 않는다.
 */
@CapacitorPlugin(name = "TextScanner")
public class TextScannerPlugin extends Plugin {

    private TextRecognizer recognizer;

    @Override
    public void load() {
        recognizer = TextRecognition.getClient(new KoreanTextRecognizerOptions.Builder().build());
    }

    @PluginMethod
    public void recognize(PluginCall call) {
        String data = call.getString("image");
        if (data == null) {
            call.reject("이미지가 없어요");
            return;
        }
        int comma = data.indexOf(',');
        if (data.startsWith("data:") && comma > 0) data = data.substring(comma + 1);

        Bitmap bitmap;
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (IllegalArgumentException e) {
            bitmap = null;
        }
        if (bitmap == null) {
            call.reject("이미지를 열 수 없어요");
            return;
        }

        recognizer.process(InputImage.fromBitmap(bitmap, 0))
            .addOnSuccessListener(text -> {
                JSArray lines = new JSArray();
                for (Text.TextBlock block : text.getTextBlocks()) {
                    for (Text.Line line : block.getLines()) {
                        Rect r = line.getBoundingBox();
                        if (r == null) continue;
                        JSObject o = new JSObject();
                        o.put("text", line.getText());
                        o.put("x", r.left);
                        o.put("y", r.top);
                        o.put("w", r.width());
                        o.put("h", r.height());
                        lines.put(o);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("lines", lines);
                call.resolve(ret);
            })
            .addOnFailureListener(e -> call.reject("글자 인식에 실패했어요: " + e.getMessage()));
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) recognizer.close();
    }
}
