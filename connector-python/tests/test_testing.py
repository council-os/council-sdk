import pytest
from pydantic import BaseModel
from council_connector_sdk import (
    define_connector,
    create_test_context,
    MockHttpRule,
    ConnectorContext,
)


class ForecastParams(BaseModel):
    city: str


class ForecastResult(BaseModel):
    temp: float
    condition: str


@define_connector(name="weather", version="1.0.0", publisher="council", trust="council")
class WeatherConnector:
    async def get_forecast(self, params: ForecastParams, ctx: ConnectorContext) -> ForecastResult:
        resp = await ctx.http.get(
            f"https://weather.api/forecast?city={params.city}",
            headers={"Authorization": f"Bearer {ctx.config.get_required('api_key')}"},
        )
        return ForecastResult(temp=resp.data["temp"], condition=resp.data["condition"])


@pytest.mark.asyncio
async def test_create_test_context_config():
    ctx = create_test_context(config={"api_key": "test-key"})
    assert ctx.config.get("api_key") == "test-key"
    assert ctx.config.get("missing") is None
    assert ctx.config.get_required("api_key") == "test-key"


@pytest.mark.asyncio
async def test_create_test_context_config_required_raises():
    ctx = create_test_context()
    with pytest.raises(KeyError, match="Missing required config"):
        ctx.config.get_required("api_key")


@pytest.mark.asyncio
async def test_http_mock_matches_pattern():
    ctx = create_test_context(
        http_mocks={"https://weather.api/*": MockHttpRule(status=200, body={"temp": 72, "condition": "sunny"})},
    )
    resp = await ctx.http.get("https://weather.api/forecast?city=SF")
    assert resp.status == 200
    assert resp.data["temp"] == 72


@pytest.mark.asyncio
async def test_http_mock_returns_404_for_unmatched():
    ctx = create_test_context()
    resp = await ctx.http.get("https://unknown.com/api")
    assert resp.status == 404


@pytest.mark.asyncio
async def test_http_tracks_calls():
    ctx = create_test_context(
        http_mocks={"https://api.test.com/*": MockHttpRule(status=200, body={})},
    )
    await ctx.http.get("https://api.test.com/a")
    await ctx.http.post("https://api.test.com/b", body={"x": 1})
    assert len(ctx.http.calls) == 2
    assert ctx.http.calls[0].method == "GET"
    assert ctx.http.calls[1].method == "POST"
    assert ctx.http.calls[1].body == {"x": 1}


@pytest.mark.asyncio
async def test_end_to_end_with_connector():
    ctx = create_test_context(
        config={"api_key": "test-weather-key"},
        http_mocks={"https://weather.api/*": MockHttpRule(status=200, body={"temp": 72, "condition": "sunny"})},
    )
    connector = WeatherConnector()
    result = await connector.get_forecast(ForecastParams(city="SF"), ctx)
    assert result.temp == 72
    assert result.condition == "sunny"
    assert len(ctx.http.calls) == 1
    assert ctx.http.calls[0].headers["Authorization"] == "Bearer test-weather-key"
