package io.example.order.form;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

/**
 * 受注1件の受け取り口。
 *
 * <p><b>ここが「定義」の代わり。</b> hatake 版では `definitions/app.yaml` に1回書いた
 * ものを、この版では
 *
 * <ul>
 *   <li>サーバ … この DTO の注釈</li>
 *   <li>画面 … Flutter の Widget（`no-framework/flutter-src`）</li>
 * </ul>
 *
 * の<b>2か所に書く</b>。同じ規則を2か所に書くので、片方だけ直したときに食い違う
 * （そして食い違いは、どちらかを直すまで誰も気づかない）。
 *
 * <p>もう1つの違いは<b>画面の形がここから出てこない</b>こと。桁も必須も分かっているのに、
 * ラベル・並び・入力の種類は書いていないので、画面は別に組むことになる。
 * 設計書も同じ理由で、この DTO からは起こせない。
 */
public record OrderRequest(
        @NotBlank(message = "必須項目です")
        String customerCode,

        @NotBlank(message = "必須項目です")
        String orderDate,

        @NotBlank(message = "必須項目です")
        String dueDate,

        @NotBlank(message = "必須項目です")
        @Size(max = 20, message = "20文字以内で入力してください")
        String salesPersonName,

        @Size(max = 60, message = "60文字以内で入力してください")
        String deliveryPlace,

        @Size(max = 200, message = "200文字以内で入力してください")
        String note,

        // 明細は「1行以上」かつ「行の中も見る」。`@Valid` を書き忘れると
        // **行の中は一度も見られない**（書き忘れても何も言われない）。
        @NotEmpty(message = "必須項目です")
        @Valid
        List<OrderLineRequest> lines,

        /** 同時更新の合言葉。検証はしない（照合はサーバの更新文でやる）。 */
        String updatedAt) {

    /** 明細1行。 */
    public record OrderLineRequest(
            @NotBlank(message = "必須項目です")
            String productCode,

            @jakarta.validation.constraints.NotNull(message = "必須項目です")
            @jakarta.validation.constraints.Min(value = 1, message = "数量は1以上にしてください")
            @jakarta.validation.constraints.Max(value = 9999, message = "9999以下で入力してください")
            Integer quantity,

            @jakarta.validation.constraints.NotNull(message = "必須項目です")
            @jakarta.validation.constraints.Min(value = 0, message = "0以上で入力してください")
            Long unitPrice,

            Boolean cancelled) {
    }
}
