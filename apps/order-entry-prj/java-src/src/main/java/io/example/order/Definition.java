package io.example.order;

import io.hatake.core.AppDefinition;
import io.hatake.core.AppParser;
import io.hatake.core.ColumnDefinition;
import io.hatake.core.PageDefinition;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * 画面と<b>同じ定義</b>を読む。
 *
 * <p>ここが hatake の主張そのもの: 画面を描く定義と、API がリクエストを検証する定義が
 * 同じ1枚。だから {@code definitions/} は案件の直下に置いてあり、この API は
 * そこを見る（コピーを持たない＝コピーを持った瞬間、ずれても誰も気づかない）。
 *
 * <p>枠組みから読むのは2つ。どちらも<b>この案件を作っている途中で枠組みに入った</b>
 * （0.9.0 には無くて、いったん手で書いた）:
 *
 * <ul>
 *   <li>{@link AppParser#parseAppPagesYaml} … 画面を<b>中身まで</b>読む。
 *       0.9.0 の Java 版は {@code PageRef}（id・種別・タイトル・Repository）しか
 *       返さず、{@code form} も {@code search} も取れなかった</li>
 *   <li>{@link ColumnDefinition#roles} … 列を<b>誰が見てよいか</b>。
 *       0.9.0 の Java 版は「描画専用のキー」として落としていた</li>
 * </ul>
 */
@Component
public class Definition {

    private final String source;
    private final AppDefinition app;
    private final Map<String, PageDefinition> pages;

    public Definition(@Value("${hatake.definition}") String path) {
        try {
            this.source = Files.readString(Path.of(path));
        } catch (IOException e) {
            throw new UncheckedIOException("定義が読めません: " + path, e);
        }
        // strict で読む＝知らないキーは**起動時に**落とす（動かしてから気づかない）。
        this.app = AppParser.parseAppYaml(source, true);
        this.pages = AppParser.parseAppPagesYaml(source, true);
    }

    /** 素の定義（配るときにそのまま返す）。 */
    public String source() {
        return source;
    }

    /** アプリ全体（役割の語彙など）。 */
    public AppDefinition app() {
        return app;
    }

    /** 画面1枚。無ければ落とす＝設定の間違いを起動時に出す。 */
    public PageDefinition page(String id) {
        PageDefinition page = pages.get(id);
        if (page == null) {
            throw new IllegalStateException("定義に画面 \"" + id + "\" がありません");
        }
        return page;
    }

    /**
     * その画面の「項目名 → その列を見てよい役割」。役割を書いていない列は入らない。
     *
     * <p>定義を正にするための1本道。ここで別の表を持つと、画面では隠れているのに
     * API では通る（またはその逆）が起きて、しかも誰も気づかない。
     */
    public Map<String, List<String>> columnRoles(String pageId) {
        Map<String, List<String>> roles = new LinkedHashMap<>();
        for (ColumnDefinition column : page(pageId).table().columns()) {
            if (!column.roles().isEmpty()) {
                roles.put(column.field(), List.copyOf(new ArrayList<>(column.roles())));
            }
        }
        return roles;
    }
}
