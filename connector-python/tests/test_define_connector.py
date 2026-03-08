import pytest
from pydantic import BaseModel
from council_connector_sdk import define_connector, ConnectorContext


class DummyConfig(BaseModel):
    api_key: str


def test_define_connector_decorates_class():
    @define_connector(name="test", version="1.0.0", publisher="council", trust="council", config_schema=DummyConfig)
    class TestConnector:
        async def do_thing(self, params, ctx: ConnectorContext):
            return {"done": True}

    assert TestConnector._connector_name == "test"
    assert TestConnector._connector_version == "1.0.0"
    assert TestConnector._connector_trust == "council"
    assert "do_thing" in TestConnector._connector_operations


def test_define_connector_rejects_empty_name():
    with pytest.raises(ValueError, match="name is required"):
        @define_connector(name="", version="1.0.0", publisher="council", trust="council")
        class Bad:
            async def op(self, params, ctx):
                pass


def test_define_connector_rejects_empty_version():
    with pytest.raises(ValueError, match="version is required"):
        @define_connector(name="test", version="", publisher="council", trust="council")
        class Bad:
            async def op(self, params, ctx):
                pass


def test_define_connector_rejects_no_operations():
    with pytest.raises(ValueError, match="at least one public method"):
        @define_connector(name="test", version="1.0.0", publisher="council", trust="council")
        class Bad:
            pass
