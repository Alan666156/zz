package com.zz.babyfeeding.health;

import com.zz.babyfeeding.common.api.ApiResponse;
import com.zz.babyfeeding.common.api.ErrorCode;
import com.zz.babyfeeding.config.AppProperties;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class HealthControllerTest {

    private static AppProperties properties() {
        AppProperties properties = new AppProperties();
        properties.setVersion("1.0.0-test");
        return properties;
    }

    private static HealthController controller(JdbcTemplate jdbc,
                                               RedisConnectionFactory factory) {
        return new HealthController(jdbc, factory, properties());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> data(ResponseEntity<ApiResponse<Object>> response) {
        return (Map<String, Object>) response.getBody().data();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> check(Map<String, Object> data, String name) {
        return (Map<String, Object>) ((Map<String, Object>) data.get("checks")).get(name);
    }

    private static RedisConnectionFactory pongFactory() {
        RedisConnectionFactory factory = mock(RedisConnectionFactory.class);
        RedisConnection connection = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(connection);
        when(connection.ping()).thenReturn("PONG");
        return factory;
    }

    @Test
    void reportsUpWhenBothDependenciesRespond() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);

        ResponseEntity<ApiResponse<Object>> response =
                controller(jdbc, pongFactory()).health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().code()).isEqualTo(ErrorCode.OK.getCode());
        Map<String, Object> data = data(response);
        assertThat(data.get("status")).isEqualTo("UP");
        assertThat(data.get("version")).isEqualTo("1.0.0-test");
        assertThat(check(data, "db").get("status")).isEqualTo("UP");
        assertThat(check(data, "redis").get("status")).isEqualTo("UP");
        assertThat(check(data, "db")).doesNotContainKey("error");
    }

    @Test
    void reportsDownWhenDbReturnsAnUnexpectedValue() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(0);

        ResponseEntity<ApiResponse<Object>> response =
                controller(jdbc, pongFactory()).health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(response.getBody().code())
                .isEqualTo(ErrorCode.SERVICE_UNAVAILABLE.getCode());
        Map<String, Object> data = data(response);
        assertThat(data.get("status")).isEqualTo("DOWN");
        assertThat(check(data, "db").get("error")).isEqualTo("IllegalStateException");
        assertThat(check(data, "redis").get("status")).isEqualTo("UP");
    }

    @Test
    void reportsDownWhenDbThrows() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class))
                .thenThrow(new DataAccessResourceFailureException("db down"));

        ResponseEntity<ApiResponse<Object>> response =
                controller(jdbc, pongFactory()).health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(check(data(response), "db").get("error"))
                .isEqualTo("DataAccessResourceFailureException");
    }

    @Test
    void reportsDownWhenRedisDoesNotPong() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);
        RedisConnectionFactory factory = mock(RedisConnectionFactory.class);
        RedisConnection connection = mock(RedisConnection.class);
        when(factory.getConnection()).thenReturn(connection);
        when(connection.ping()).thenReturn("NO");

        ResponseEntity<ApiResponse<Object>> response =
                controller(jdbc, factory).health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(check(data(response), "redis").get("error"))
                .isEqualTo("IllegalStateException");
    }

    @Test
    void reportsDownWhenRedisConnectionFails() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject("SELECT 1", Integer.class)).thenReturn(1);
        RedisConnectionFactory factory = mock(RedisConnectionFactory.class);
        when(factory.getConnection())
                .thenThrow(new RedisConnectionFailureException("redis down"));

        ResponseEntity<ApiResponse<Object>> response =
                controller(jdbc, factory).health();

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(check(data(response), "redis").get("error"))
                .isEqualTo("RedisConnectionFailureException");
    }
}
