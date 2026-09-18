package io.example.order.web;

import java.util.Set;

/** ログインしている人。<b>枠組みの外</b>（hatake は誰がログインしているか知らない）。 */
public record User(String userId, String name, Set<String> roles) {

    public boolean is(String role) {
        return roles.contains(role);
    }
}
