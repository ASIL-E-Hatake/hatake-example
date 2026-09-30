package io.example.order;

import io.hatake.core.AppDefinition;
import io.hatake.core.AppParser;
import io.hatake.core.PageDefinition;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.yaml.snakeyaml.Yaml;

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
 *   <li>{@link #document()}（素の定義）… <b>誰に何を許すか</b>（画面・ボタン・列と項目の
 *       {@code roles}）。枠組みの {@code ServerAccess} がこれを読む（0.9.22 から）。
 *       0.9.0 の Java 版は列の {@code roles} を「描画専用のキー」として落としていて、
 *       0.9.20 までは役割名をコントローラに決め打ちしていた</li>
 * </ul>
 */
@Component
public class Definition {

    private final String source;
    private final AppDefinition app;
    private final Map<String, PageDefinition> pages;
    private final Map<String, Object> document;

    public Definition(@Value("${hatake.definition}") String path) {
        try {
            this.source = Files.readString(Path.of(path));
        } catch (IOException e) {
            throw new UncheckedIOException("定義が読めません: " + path, e);
        }
        // strict で読む＝知らないキーは**起動時に**落とす（動かしてから気づかない）。
        this.app = AppParser.parseAppYaml(source, true);
        this.pages = AppParser.parseAppPagesYaml(source, true);
        this.document = rawOf(source);
    }

    /** 素の定義（配るときにそのまま返す）。 */
    @SuppressWarnings("unchecked")
    private static Map<String, Object> rawOf(String source) {
        return (Map<String, Object>) new Yaml().load(source);
    }

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
     * 素の定義（解析前の Map）。権限と一括の上限の口（{@code ServerAccess} /
     * {@code BulkLimits}）が受ける形。
     *
     * <p>この版の {@link PageDefinition} はボタンも画面の {@code roles} も持たないので、
     * 何を誰に許すかは素の定義から読む。<b>読むのはここ1か所</b>（コントローラごとに
     * YAML を読み直さない）。
     */
    public Map<String, Object> document() {
        return document;
    }
}
