package io.example.order.web;

import io.hatake.core.FormValidator;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 返すエラーを1か所に集める。
 *
 * <p>押した人が<b>次に何をすればいいか</b>が分かる言い方で返すのが方針。
 * 「エラーが発生しました」は、押した人にとって何も言っていないのと同じ。
 */
@RestControllerAdvice
public class Errors {

    /** ログインしていない（401）。 */
    public static class Unauthorized extends RuntimeException {
        public Unauthorized(String message) {
            super(message);
        }
    }

    /** 役割が足りない（403）。居ることは認めるが、その操作は許さない。 */
    public static class Forbidden extends RuntimeException {
        public Forbidden(String message) {
            super(message);
        }
    }

    /** 無い（404）。 */
    public static class NotFound extends RuntimeException {
        public NotFound(String message) {
            super(message);
        }
    }

    /** ぶつかった（409）。同時更新・締め済み・参照されている、など。 */
    public static class Conflict extends RuntimeException {
        public Conflict(String message) {
            super(message);
        }
    }

    /** 押した人の入力が通らない（400）。項目ごとの理由を返す。 */
    public static class Invalid extends RuntimeException {
        private final transient List<FormValidator.ValidationError> errors;

        public Invalid(List<FormValidator.ValidationError> errors) {
            super("入力を確かめてください");
            this.errors = errors;
        }

        public List<FormValidator.ValidationError> errors() {
            return errors;
        }
    }

    @ExceptionHandler(Unauthorized.class)
    ResponseEntity<Map<String, Object>> onUnauthorized(Unauthorized e) {
        return of(HttpStatus.UNAUTHORIZED, e.getMessage());
    }

    @ExceptionHandler(Forbidden.class)
    ResponseEntity<Map<String, Object>> onForbidden(Forbidden e) {
        return of(HttpStatus.FORBIDDEN, e.getMessage());
    }

    @ExceptionHandler(NotFound.class)
    ResponseEntity<Map<String, Object>> onNotFound(NotFound e) {
        return of(HttpStatus.NOT_FOUND, e.getMessage());
    }

    @ExceptionHandler(Conflict.class)
    ResponseEntity<Map<String, Object>> onConflict(Conflict e) {
        return of(HttpStatus.CONFLICT, e.getMessage());
    }

    /** 検証の失敗は<b>項目ごと</b>に返す（画面がその欄の下に出せる形）。 */
    @ExceptionHandler(Invalid.class)
    ResponseEntity<Map<String, Object>> onInvalid(Invalid e) {
        return ResponseEntity.badRequest().body(Map.of(
                "valid", false,
                "errors", e.errors().stream()
                        .map(one -> Map.of("field", one.field(), "message", one.message()))
                        .toList()));
    }

    private static ResponseEntity<Map<String, Object>> of(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
