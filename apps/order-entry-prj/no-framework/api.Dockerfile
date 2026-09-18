# API（Java / Spring Boot）— フレームワーク**無し**版。
#
# hatake 版との差は1つだけ: **枠組みを取りに行かない**（JitPack も要らない）。
# 定義も持ち込まない（読む相手が無い）。
FROM gradle:8-jdk21 AS build
WORKDIR /build

COPY no-framework/java-src/settings.gradle no-framework/java-src/build.gradle ./
RUN gradle --no-daemon dependencies --configuration runtimeClasspath > /dev/null 2>&1 || true

COPY no-framework/java-src/src ./src
RUN gradle --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/build/libs/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
