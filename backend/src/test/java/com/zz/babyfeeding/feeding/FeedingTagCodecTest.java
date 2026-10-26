package com.zz.babyfeeding.feeding;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FeedingTagCodecTest {

    private final FeedingTagCodec codec = new FeedingTagCodec(new ObjectMapper());

    @Test
    void encodesEnumNamesInOrder() {
        assertThat(codec.toJson(List.of(FeedingTag.SPIT_UP, FeedingTag.SLEEPY)))
                .isEqualTo("[\"SPIT_UP\",\"SLEEPY\"]");
        assertThat(codec.toJson(List.of())).isEqualTo("[]");
        assertThat(codec.toJson(null)).isNull();
    }

    @Test
    void decodesStoredOrderAndTreatsBlankAsNull() {
        assertThat(codec.fromJson("[\"SLEEPY\",\"SPIT_UP\"]"))
                .containsExactly("SLEEPY", "SPIT_UP");
        assertThat(codec.fromJson(null)).isNull();
        assertThat(codec.fromJson("  ")).isNull();
        assertThatThrownBy(() -> codec.fromJson("["))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("feeding tags");
    }

    @Test
    void convertsStoredCodesBackToEnums() {
        assertThat(codec.toTags(null)).isNull();
        assertThat(codec.toTags(List.of("SLEEPY", "SPIT_UP")))
                .containsExactly(FeedingTag.SPIT_UP, FeedingTag.SLEEPY);
        assertThatThrownBy(() -> codec.toTags(Arrays.asList("SPIT_UP", "NOPE")))
                .isInstanceOf(com.zz.babyfeeding.common.api.BusinessException.class);
    }
}
