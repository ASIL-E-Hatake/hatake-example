# API（Java / Spring Boot）。
#
# **利用者に何も入れさせない**のがこの見本の決めごとなので、JDK も Gradle も
# ここで用意する。hatake は JitPack から入る（`java-src/build.gradle`）ので、
# 枠組みを clone する必要は無い。
#
# 依存を先に解決してからソースを入れる＝ソースを直したときに依存を引き直さない。
FROM gradle:8-jdk21 AS build
WORKDIR /build

COPY java-src/settings.gradle java-src/build.gradle ./
# 依存だけ先に取る。`--no-daemon` はコンテナの中では素直（常駐しても次が無い）。
RUN gradle --no-daemon dependencies --configuration runtimeClasspath > /dev/null 2>&1 || true

COPY java-src/src ./src
RUN gradle --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/build/libs/*.jar app.jar

# 定義は**焼き込まない**（compose が案件の `definitions/` をそのまま載せる）。
# 焼き込むと、定義を直したのに API が古いまま、が黙って起きる。
ENV HATAKE_DEFINITION=/app/definitions/app.yaml

EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
