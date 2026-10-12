"""Enable the shared card library through the integrations UI."""
from homeassistant import config_entries


class CardLibraryFlow(config_entries.ConfigFlow, domain="card_library"):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        await self.async_set_unique_id("card_library")
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Library Card", data={})
        return self.async_show_form(step_id="user")
