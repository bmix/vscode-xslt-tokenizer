<xsl:template xmlns:xsl="abc" xmlns:fn="def">
    <xsl:include href="included1.xsl"/>
    <xsl:import href="included2.xsl"/>
    
    <xsl:param name="p1" as="xs:integer" select="1"/>
    <xsl:variable name="v1" as="xs:integer" select="2"/>
    <xsl:function name="fn:name" as="xs:string">
        <xsl:param name="fp1" as="node()"/>      
    </xsl:function>
    <xsl:sequence select="$inc1v1"/>
    
                
</xsl:template>
