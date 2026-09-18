package io.example.order.web;

import io.example.order.Definition;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 画面の定義を配る。<b>定義に書けない口</b>（この案件の作り）。
 *
 * <p>画面（Flutter）は定義のコピーを持たず、起動時にここから受け取る＝
 * <b>画面と API が同じ1枚を読む</b>ことが、動かしている状態でも保証される。
 * ビルドに焼き込むと、直したのに画面が古い定義のまま、が黙って起きる。
 */
@RestController
public class DefinitionController {

    private final Definition definition;

    public DefinitionController(Definition definition) {
        this.definition = definition;
    }

    @GetMapping(value = "/api/definition.yaml", produces = MediaType.TEXT_PLAIN_VALUE)
    public String definition() {
        return definition.source();
    }
}
