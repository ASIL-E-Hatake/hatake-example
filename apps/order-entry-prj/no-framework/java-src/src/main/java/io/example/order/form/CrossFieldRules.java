package io.example.order.form;

import io.example.order.form.OrderRequest.OrderLineRequest;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 項目をまたいで見る規則。
 *
 * <p><b>Bean Validation の注釈では書けないもの</b>をここに集めた。
 * 注釈は「その項目1つ」しか見ないので、
 *
 * <ul>
 *   <li>納期 ≧ 受注日 … 2つの項目を比べる</li>
 *   <li>同じ商品を2行に入れない … <b>行をまたいで</b>見る</li>
 * </ul>
 *
 * は入らない。独自の注釈（`@AssertTrue` やクラスレベルの制約）で書くこともできるが、
 * 注釈1つにつき「制約クラス＋バリデータクラス」の2枚が要るので、この規模なら
 * 素直に書いたほうが短い。
 *
 * <p>hatake 版ではどちらも定義に1行ずつ書いてあり
 * （`{ type: compare, field: orderDate, operator: gte }` と `{ type: unique, of: productCode }`）、
 * <b>画面もサーバも同じその1行を読む</b>。この版では、同じ規則を画面側にもう一度書く。
 */
public final class CrossFieldRules {

    /** 検証の失敗1件（項目名とメッセージ）。 */
    public record Error(String field, String message) {
    }

    private CrossFieldRules() {
    }

    /**
     * 注釈の分と、項目をまたぐ分を<b>まとめて</b>返す。
     *
     * <p><b>ここは1度しくじった所。</b> 最初は引数に {@code @Valid} を付けて Spring に
     * 任せていたが、そうすると注釈で1件でも引っかかった時点で<b>例外になって止まる</b>＝
     * 項目をまたぐ規則は一度も走らない。担当が空で納期も逆のとき、押した人には
     * 「担当が空です」だけが返り、直して送り直して初めて「納期が逆です」と言われる。
     * <b>往復が1回増える。</b>
     *
     * <p>テストが無ければ気づかなかった（画面では、担当を空にしたまま納期を逆にする、
     * という触り方をしない）。hatake 版は定義に書いた規則を1回で全部回すので、
     * この問題はそもそも起きない。
     */
    public static List<Error> checkAll(Validator validator, OrderRequest order) {
        List<Error> errors = new ArrayList<>();
        // 注釈の分。**並びが決まっていない**（Set で返る）ので、道の順にそろえる
        // ＝同じ入力なら同じ並びで返す。
        validator.validate(order).stream()
                .sorted(Comparator.comparing(one -> one.getPropertyPath().toString()))
                .map(CrossFieldRules::toError)
                .forEach(errors::add);
        errors.addAll(check(order));
        return errors;
    }

    private static Error toError(ConstraintViolation<OrderRequest> violation) {
        // `lines[0].quantity` のような道がそのまま出る（画面がその欄の下に出せる）。
        return new Error(violation.getPropertyPath().toString(), violation.getMessage());
    }

    public static List<Error> check(OrderRequest order) {
        List<Error> errors = new ArrayList<>();
        checkDueDate(order, errors);
        checkDuplicateProduct(order, errors);
        return errors;
    }

    /** 納期は受注日以降。 */
    private static void checkDueDate(OrderRequest order, List<Error> errors) {
        String from = order.orderDate();
        String to = order.dueDate();
        if (from == null || to == null || from.isBlank() || to.isBlank()) {
            return; // 空は `@NotBlank` の担当（二重に言わない）
        }
        // どちらも `yyyy-MM-dd` なので、文字のまま比べて順序が合う。
        if (to.compareTo(from) < 0) {
            errors.add(new Error("dueDate", "納期は受注日以降にしてください"));
        }
    }

    /** 同じ商品を2行に入れない（この案件で一番多いミス）。 */
    private static void checkDuplicateProduct(OrderRequest order, List<Error> errors) {
        List<OrderLineRequest> lines = order.lines();
        if (lines == null) {
            return;
        }
        Set<String> seen = new HashSet<>();
        for (OrderLineRequest line : lines) {
            String code = line.productCode();
            if (code == null || code.isBlank()) {
                continue; // 空は `@NotBlank` の担当
            }
            if (!seen.add(code)) {
                errors.add(new Error("lines", "同じ商品が複数行にあります"));
                return; // 何行あっても1件だけ言う
            }
        }
    }
}
